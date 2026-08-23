/**
 * ============================================================
 * companion_system.js
 * 仲間システム：勧誘・レベル・破壊時のランダム被害判定
 * ============================================================
 */

// 仲間候補データ（各村の villages_*.js 側で recruit として定義する想定）
// 例: villageData[1].recruit = { name: "...", ... }

/**
 * 仲間を正式に加入させる
 */
function addCompanionFighter(name) {
    if (!gameState.fighters) gameState.fighters = [];
    if (gameState.fighters.some(f => f.name === name)) return; // 重複防止
    gameState.fighters.push({
        name: name,
        level: 1,
        exp: 0,
        condition: 'safe' // safe / injured / critical / gone
    });
    updateUI();
}

/**
 * 仲間の経験値を加算し、必要ならレベルアップさせる
 */
function gainCompanionExp(name, amount) {
    if (!gameState.fighters) return;
    const f = gameState.fighters.find(x => x.name === name && x.condition !== 'gone');
    if (!f) return;
    f.exp += amount;
    const required = f.level * 30;
    if (f.exp >= required) {
        f.exp -= required;
        f.level++;
    }
}

/**
 * 被害段階の日本語ラベル
 */
const conditionLabels = {
    safe: "無事",
    injured: "負傷",
    critical: "重傷",
    gone: "喪失"
};

/**
 * 被害描写：村番号（tier）で生々しさを変える
 */
function getCasualtyText(fighterName, fromCondition, toCondition, vIndex) {
    const tier = getIntensityTier(vIndex);

    // 悪化パターンごとのテキスト
    const texts = {
        'safe->injured': {
            A: `${fighterName}が、崩れた瓦礫に足を取られてよろめいた。目立った傷はなさそうだったが、その後、少し口数が減った。`,
            B: `${fighterName}が、破片を受けて腕を庇っていた。「大丈夫」と言うその声は、少し強張っていた。`,
            C: `${fighterName}が、鋭い破片を浴びて片膝をついた。血の滲む傷を押さえながら、それでも立ち上がろうとしていた。`
        },
        'injured->critical': {
            A: `${fighterName}の傷が、思ったより深いことに気づいた。顔色が悪くなっていくのが、はっきりと分かった。`,
            B: `${fighterName}が、うずくまったまま動けなくなっていた。呼びかけても、返事はか細かった。`,
            C: `${fighterName}が、地面に倒れ込み、荒い息を繰り返していた。もう、自分の足で立つことはできそうになかった。`
        },
        'critical->gone': {
            A: `${fighterName}の姿が、光の中に静かに溶けていった。最後まで、何も言わなかった。`,
            B: `${fighterName}の輪郭が崩れ、あっという間に消えていった。呼びかける間もなかった。`,
            C: `${fighterName}が、声を上げる間もなく崩れ落ちた。もう、そこには何も残っていなかった。`
        },
        'safe->critical': {
            A: `${fighterName}が、崩れた建物の下敷きになった。助け出したときには、すでに深く傷ついていた。`,
            B: `${fighterName}が、鋭い破片の直撃を受けて倒れた。もう、自分では動けないようだった。`,
            C: `${fighterName}が、瓦礫と炎の中に投げ出された。助け出したときには、ほとんど意識がなかった。`
        },
        'safe->gone': {
            A: `${fighterName}の姿が、瞬く間に見えなくなった。何が起きたのか、把握する暇もなかった。`,
            B: `${fighterName}が、崩れる建物に呑まれて消えた。声を掛ける間もなかった。`,
            C: `${fighterName}が、一瞬で崩れ去った。悲鳴すら、聞こえなかった。`
        },
        'injured->gone': {
            A: `${fighterName}の弱っていた体が、それ以上耐えられなかったようだった。静かに、姿が消えていった。`,
            B: `${fighterName}が、傷を庇いながら崩れ、そのまま消えていった。`,
            C: `${fighterName}が、力尽きるようにして崩れ落ち、姿を消した。`
        }
    };

    const key = `${fromCondition}->${toCondition}`;
    const pool = texts[key];
    if (!pool) return `${fighterName}の様子が、少し変わったようだった。`;
    return pool[tier] || pool.A;
}

/**
 * 破壊時の被害判定：生存している全仲間が対象。
 * 前回無事だった者も、今回また対象になる。
 * 悪化する確率は現在35%（調整可）。
 */
function processCasualtiesOnDestroy(vIndex) {
    if (!gameState.fighters || gameState.fighters.length === 0) return [];

    const nextStage = { safe: 'injured', injured: 'critical', critical: 'gone' };
    const results = [];

    gameState.fighters.forEach(f => {
        if (f.condition === 'gone') return; // 既に喪失している者は対象外

        if (Math.random() < 0.35) {
            const from = f.condition;
            const to = nextStage[from];
            f.condition = to;
            results.push({
                name: f.name,
                from: from,
                to: to,
                text: getCasualtyText(f.name, from, to, vIndex)
            });
        }
    });

    return results;
}

/**
 * 破壊イベントの直後に呼び出す。被害があれば、その描写を追記する。
 * resolveVillage関数内、triggerDestroyEffect呼び出し付近から呼ぶ想定。
 */
function applyCasualtiesToText(baseText, vIndex) {
    const casualties = processCasualtiesOnDestroy(vIndex);
    if (casualties.length === 0) return baseText;

    let extra = "\n\n";
    casualties.forEach(c => {
        extra += c.text + "\n";
    });
    return baseText + extra;
}
