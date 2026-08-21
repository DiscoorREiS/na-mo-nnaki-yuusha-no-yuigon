/**
 * ============================================================
 * system.js
 * ゲームの土台となるロジック（状態管理・UI更新・共通関数）
 * このファイルには「村ごとの物語データ」は一切含まれない。
 * 村の内容を直したいときはこのファイルではなく、
 * villages_1to3.js / villages_4to6.js / villages_7to9.js / ending.js を触ること。
 * ============================================================
 */

window.onerror = function(message, source, lineno, colno, error) {
    const box = document.getElementById('text-box');
    if (box) {
        box.innerHTML = `<div class="error-box"><b>【システムエラーが発生しました】</b><br>以下の内容をそのまま開発者に伝えてください。<br><br>Message: ${message}<br>Line: ${lineno}, Col: ${colno}</div>`;
    }
    return false;
};

/**
 * ゲーム全体の状態。ここに現在の進行状況がすべて入る。
 */
const gameState = {
    currentVillageIndex: 1,
    isFateLocked: false,
    lockedChoiceID: null,
    hasEverDestroyed: false,
    destroyCount: 0,
    repairedCount: 0,
    doucho: 0,            // 単眼鏡ありのときだけ増える「同調」
    totalDoucho: 0,        // 同上（累積・侵食テキストの判定用）
    investigation: 0,       // 単眼鏡なしのときだけ増える「調査度」
    worldSaturation: 100,
    companions: [],
    victims: [],
    villageHistory: [],
    hasFoundSecret: false,
    monocleAbandoned: false,
    hasMonocle: false,      // プロローグで単眼鏡に触れたか
    firstDestructionVillage: null,
    despairType: null,
    decisionSpeedLog: [],
    skippedTopics: [],
    entryDoucho: 0,
    entrySaturation: 100,
    entryLevel: 'low'
};

/**
 * villageDataは各villages_*.jsファイルの中で
 * 「まだ存在しなければ作る、あれば追記する」形で組み立てられる。
 */
if (typeof window.villageData === 'undefined') {
    window.villageData = {};
}
const villageData = window.villageData;

// このゲームで現在実装済みの最終村番号。村を追加したら、その村のファイル側でこの値を上書きする。
window.MAX_IMPLEMENTED_VILLAGE = window.MAX_IMPLEMENTED_VILLAGE || 0;

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getIntensityTier(vIndex) {
    if (vIndex <= 3) return 'A';
    if (vIndex <= 6) return 'B';
    return 'C';
}

function calcEntryLevel(doucho, saturation) {
    const saturationPenalty = (100 - saturation);
    const score = doucho + saturationPenalty * 0.8;
    if (score >= 150) return 'high';
    if (score >= 60) return 'mid';
    return 'low';
}

function pickByEntryLevel(variants) {
    const order = ['high', 'mid', 'low'];
    const startIdx = order.indexOf(gameState.entryLevel);
    for (let i = startIdx; i < order.length; i++) {
        const arr = variants[order[i]];
        if (arr && arr.length > 0) return pickRandom(arr);
    }
    return "";
}

// 単眼鏡による特別な演出（侵食テキスト、村人の違和感への気づき等）が有効かどうか
function isMonocleActive() {
    return gameState.hasMonocle && !gameState.monocleAbandoned;
}

function getDespairName(n) {
    if (n === 1) {
        return { title: "無垢なる断絶", flavor: "何かが、静かに壊れていく音がした。もう、知らなかった頃には戻れない気がした。" };
    } else if (n <= 3) {
        return { title: "遅すぎた目覚め", flavor: "一度目には気づかなかったことが、今になって、輪郭を帯び始めていた。もう、後戻りはできないのかもしれない。" };
    } else if (n <= 6) {
        return { title: "共犯者の自覚", flavor: "ここまで重ねてきた選択の意味が、ようやく、重さを持って迫ってきた。" };
    } else {
        return { title: "狂気への転落", flavor: "積み重なったものが、あまりに多すぎた。何が現実で、何がそうでないのか、境目が滲み始めていた。" };
    }
}

let decisionRenderTime = null;
function startDecisionTimer() { decisionRenderTime = Date.now(); }
function recordDecisionSpeed(vIndex, label) {
    if (!decisionRenderTime) return;
    const elapsed = Date.now() - decisionRenderTime;
    let speed = 'normal';
    if (elapsed < 3000) speed = 'fast';
    else if (elapsed >= 10000) speed = 'slow';
    gameState.decisionSpeedLog.push({ village: vIndex, label, elapsed, speed });
    console.log(`[所要時間] 村${vIndex} ${label}: ${elapsed}ms (${speed})`);
    decisionRenderTime = null;
}

const encroachmentTexts = {
    light: [
        "ふと、視界の端に何か引っかかった気がしたが、瞬きをすると消えていた。",
        "一瞬だけ、空気の色が濁って見えた気がした。気のせいだろうか。"
    ],
    mid: [
        "一瞬、そこにいる人の輪郭が、紙のように薄く見えた気がした。",
        "誰かの声が、二重に聞こえた気がした。すぐに、いつも通りの声に戻ったが。"
    ],
    heavy: [
        "もう、何を見ても、その奥に何かが透けて見えるようになっていた。",
        "景色の輪郭という輪郭が、かすかに震えているように見えた。"
    ]
};

const encroachmentOrder = { light: 1, mid: 2, heavy: 3 };

function getEncroachmentLevel() {
    const t = gameState.totalDoucho;
    if (t >= 220) return 'heavy';
    if (t >= 120) return 'mid';
    if (t >= 50) return 'light';
    return null;
}

// 単眼鏡を持たない場合、侵食テキストは一切発生しない
function maybeGetEncroachmentText() {
    if (!isMonocleActive()) return null;
    const level = getEncroachmentLevel();
    if (!level) return null;
    if (Math.random() < 0.15) {
        return pickRandom(encroachmentTexts[level]);
    }
    return null;
}

function canSeeMonocleExtra() {
    if (!isMonocleActive()) return false;
    const level = getEncroachmentLevel();
    if (!level) return false;
    return encroachmentOrder[level] >= encroachmentOrder.mid;
}

function getDestroyIntensity(vIndex) {
    const base = gameState.firstDestructionVillage;
    if (base === null) return 1;
    const distance = vIndex - base;
    if (distance <= 0) return 1;
    if (distance === 1) return 2;
    if (distance === 2) return 3;
    if (distance <= 4) return 4;
    return 5;
}

const repairAfterDestroyMonologue = {
    1: "──これで、よかったのだろうか。",
    2: "──また、同じことをしている。分かってはいるのに。",
    3: "──もう、何度目だろう。数えることも、しなくなっていた。",
    4: "──これが正しいのか、間違っているのか、考えることをやめていた。",
    5: "──何も、感じなくなっている自分に、気づかないふりをしていた。"
};

const fateLockDialogue = {
    A: {
        intro: "この装置に触れることが、何を意味するのか、まだよく分からない。\nただ、もう後戻りはできない気がした。",
        repairLabel: "【修理】今まで通り、装置を直す",
        repairTrueVoice: "【修理】また一人、消えていく",
        destroyLabel: "【破壊】このまま、装置を壊してみる",
        destroyTrueVoice: "【破壊】もう、引き返せない"
    },
    B: {
        intro: "装置に触れるたび、何かが少しずつ変わっていく気がする。\nこの感覚の正体は、まだつかめないままだった。",
        repairLabel: "【修理】これまでと同じように、装置を直す",
        repairTrueVoice: "【修理】また誰かの名前を、名簿に刻む",
        destroyLabel: "【破壊】確かめるために、装置を壊す",
        destroyTrueVoice: "【破壊】色を、また一つ奪う"
    },
    C: {
        intro: "もう、装置に触れるたびに何が起きるか、嫌というほど分かっている。\nそれでも、この道を選び続けるしかなかった。",
        repairLabel: "【修理】血の匂いに耐えて、装置を直す",
        repairTrueVoice: "【修理】また、誰かを殺す",
        destroyLabel: "【破壊】屍を踏み越えて、装置を壊す",
        destroyTrueVoice: "【破壊】もう、止まれない"
    }
};

const selfTerminationTextsByVillage = {
    7: "灰塚の焼け跡に、静かに身を横たえた。かつての戦の跡に、もう一つの跡が加わっただけだった。",
    8: "美しすぎる町の花壇のそばで、そっと膝をついた。整いすぎた景色が、最後にひどく歪んで見えた。",
    9: "黒く塗り潰されかけた台地の上で、もう指一本動かす気力もなかった。視界のノイズが、意識ごと塗り潰していった。"
};

/**
 * UI更新（サイドパネル全体）
 * 単眼鏡の有無で「同調」と「調査度」の表示を切り替える。
 */
function updateUI() {
    document.documentElement.style.setProperty('--saturation', `${gameState.worldSaturation}%`);
    document.getElementById('loc-val').innerText = villageData[gameState.currentVillageIndex]?.name || `第${gameState.currentVillageIndex}の地域`;
    document.getElementById('party-val').innerText = gameState.companions.length > 0 ? gameState.companions.join('・') : "なし";

    const repEl = document.getElementById('rep-val');
    if (gameState.destroyCount >= 2) {
        repEl.style.color = '#ff4444';
        const rCount = gameState.repairedCount + 2;
        repEl.innerText = 'E' + 'R'.repeat(rCount) + 'OR';
    } else {
        repEl.style.color = '';
        repEl.innerText = gameState.repairedCount;
    }

    const susLine = document.getElementById('sus-label-line');
    if (isMonocleActive()) {
        susLine.childNodes[0].textContent = "単眼鏡の同調: ";
        document.getElementById('sus-val').innerText = gameState.doucho;
    } else {
        susLine.childNodes[0].textContent = "調査度: ";
        document.getElementById('sus-val').innerText = gameState.investigation;
    }

    document.getElementById('sat-val').innerText = `${gameState.worldSaturation}%`;

    if (gameState.despairType) {
        document.getElementById('despair-group').style.display = 'block';
        document.getElementById('despair-val').innerText = gameState.despairType.title;
    }

    const listEl = document.getElementById('victim-list');
    listEl.innerHTML = '';
    gameState.victims.forEach((v, index) => {
        const li = document.createElement('li');
        li.innerText = `${v.village}. ${v.villageName}：${v.name}`;
        if (v.read) li.classList.add('read');
        li.onclick = () => showEpilogue(index);
        listEl.appendChild(li);
    });

    console.log(`[状態] 村:${gameState.currentVillageIndex} 彩度:${gameState.worldSaturation}% 同調:${gameState.doucho} 調査度:${gameState.investigation} 累積同調:${gameState.totalDoucho} 入村時Lv:${gameState.entryLevel} 破壊回数:${gameState.destroyCount} 修理回数:${gameState.repairedCount} 単眼鏡所持:${gameState.hasMonocle} 絶望:${gameState.despairType?.title || 'なし'}`);
}

function showEpilogue(index) {
    const v = gameState.victims[index];
    v.read = true;
    updateUI();
    let html = `<span style="color:#888;">──${v.name}の記録より──</span><br>${v.epilogue}`;
    if (isMonocleActive() && v.epilogueDeep) {
        html += `<br><br><span style="color:#f2e8d0;">単眼鏡を通して見ると、もう一段、深い記録が浮かび上がった。</span><br>${v.epilogueDeep}`;
    }
    document.getElementById('text-box').innerHTML = html;
}

function updateText(text) {
    document.getElementById('text-box').innerHTML = text.replace(/\n/g, '<br>');
    attachSecretHandlers();
}

function attachSecretHandlers() {
    document.querySelectorAll('.hidden-word').forEach(el => {
        el.onclick = () => {
            const secretId = el.dataset.secret;
            revealSecret(secretId);
        };
    });
}

/**
 * 秘密（メモ・楽譜等）の発見処理。
 * 単眼鏡の有無に一切関係なく発見できる。
 */
function revealSecret(secretId) {
    if (gameState.hasFoundSecret) return;
    gameState.hasFoundSecret = true;

    if (isMonocleActive()) {
        gameState.doucho += 15;
        gameState.totalDoucho += 15;
    } else {
        gameState.investigation += 15;
    }
    updateUI();

    const data = villageData[gameState.currentVillageIndex];
    const box = document.getElementById('text-box');
    box.innerHTML += '<br><br>' + data.secretReveal.replace(/\n/g, '<br>');
}

function setChoices(choices) {
    const container = document.getElementById('choices-container');
    container.innerHTML = '';
    choices.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'choice-button' + (c.isSpecial ? ' special' : '');
        if (gameState.isFateLocked && c.isMajor && c.id !== gameState.lockedChoiceID) {
            btn.innerText = "×××××××";
            btn.disabled = true;
        } else {
            btn.innerText = c.text;
            btn.onclick = c.action;
        }
        container.appendChild(btn);
    });
}

function triggerDestroyEffect(satLoss) {
    const body = document.getElementById('body-main');
    body.classList.add('flash');
    setTimeout(() => body.classList.remove('flash'), 500);
    gameState.worldSaturation = Math.max(0, gameState.worldSaturation - satLoss);
    updateUI();
}

const rumorTextsByAction = {
    DESTROY: [
        (prevName) => `「そういえば、${prevName}で妙な話を聞いたよ。急に静かになったとか、賑やかになったとか……よく分からないけどね」\n旅人はそう言って、笑いながら去っていった。`,
        (prevName) => `「${prevName}の方から来た人が、少し様子がおかしかったな。何かあったのかもしれない」\n旅人は首をかしげながら、それ以上は語らなかった。`,
        (prevName) => `「${prevName}を通ってきたけど、思っていたより静かだったよ。まあ、気のせいかもね」\n旅人はそう言って、肩をすくめた。`
    ],
    REPAIR: [
        (prevName) => `「${prevName}は今も平和らしいね。羨ましい話だ」\n旅人はそう呟いて、興味なさそうに立ち去った。`,
        (prevName) => `「${prevName}の人たちは、今日も元気に笑っていたよ」\n旅人は特に気にする様子もなく、そう話した。`,
        (prevName) => `「${prevName}を通ってきたけど、変わらず賑やかだったな」\n旅人はそう言って、次の話題に移った。`
    ],
    SPECIAL: [
        (prevName) => `「${prevName}の方で、何か不思議な出来事があったらしいけど……詳しいことは、旅人も知らないようだった。」`,
        (prevName) => `「${prevName}では、何かが少し変わった気がする、と誰かが言っていたよ」\n旅人はそれ以上、詳しくは知らないようだった。`,
        (prevName) => `「${prevName}を通ってきたが、うまく言えないけど、いつもと違う空気だった気がする」`
    ]
};

function getRumorText(vIndex) {
    const prevRecord = gameState.villageHistory.find(h => h.village === vIndex - 1);
    if (!prevRecord) {
        return pickRandom([
            "旅人はさして面白くもない世間話をしただけだった。",
            "特に目新しい話は聞けなかった。",
            "旅人は疲れた様子で、当たり障りのない話をしていった。"
        ]);
    }
    const prevName = villageData[vIndex - 1].name;
    const pool = rumorTextsByAction[prevRecord.action] || rumorTextsByAction.SPECIAL;
    return pickRandom(pool)(prevName);
}

/**
 * トピックのテキスト決定。
 * ・秘密（メモ等）の発見は単眼鏡の有無に関係なく可能
 * ・withMonocleExtra（単眼鏡越しの追加描写）は単眼鏡所持時のみ
 */
function getTopicText(topic, vIndex) {
    if (topic.isRumorTopic) {
        if (!topic.visited) {
            topic.visited = true;
            if (isMonocleActive()) {
                gameState.doucho += topic.gain;
                gameState.totalDoucho += topic.gain;
            } else {
                gameState.investigation += topic.gain;
            }
        }
        return getRumorText(vIndex);
    }

    if (!topic.visited) {
        topic.visited = true;
        if (isMonocleActive()) {
            gameState.doucho += topic.gain;
            gameState.totalDoucho += topic.gain;
        } else {
            gameState.investigation += topic.gain;
        }
        return pickRandom(topic.firstTexts);
    }

    const encroachment = maybeGetEncroachmentText();
    if (encroachment) return encroachment;

    // 秘密の発見：単眼鏡の有無に関係なく可能
    if (topic.isSecretTopic && !gameState.hasFoundSecret && Math.random() < 0.45) {
        return topic.secretVariant;
    }

    if (topic.withMonocleExtra && canSeeMonocleExtra() && Math.random() < 0.35) {
        return topic.withMonocleExtra;
    }

    return pickRandom(topic.loopTexts);
}

function renderExploration(vIndex) {
    updateUI();
    const data = villageData[vIndex];

    const choices = data.topics.map(topic => ({
        text: topic.label,
        action: () => {
            const text = getTopicText(topic, vIndex);
            updateUI();
            updateText(text);
            renderExploration(vIndex);
        }
    }));

    data.topics.forEach(topic => {
        if (topic.deepChoice && gameState.doucho >= topic.deepChoice.threshold && topic.visited) {
            choices.push({
                text: topic.deepChoice.label,
                isSpecial: true,
                action: () => {
                    gameState.worldSaturation = Math.max(0, gameState.worldSaturation - topic.deepChoice.saturationCost);
                    updateUI();
                    updateText(topic.deepChoice.text);
                    topic.deepChoice = null;
                    renderExploration(vIndex);
                }
            });
        }
    });

    if (gameState.totalDoucho >= 220 && isMonocleActive()) {
        choices.push({
            text: "……もう、これ以上は見たくない",
            isSpecial: true,
            action: () => abandonMonocle(vIndex)
        });
    }

    choices.push({ text: "ビーコンへ向かう", action: () => renderBeacon(vIndex) });
    setChoices(choices);
}

function abandonMonocle(vIndex) {
    gameState.monocleAbandoned = true;
    updateUI();
    updateText("単眼鏡を、そっと懐にしまった。\nもう、これ以上は見なくていい。そう思った。");
    setChoices([{ text: "先へ進む", action: () => renderExploration(vIndex) }]);
}

function renderBeacon(vIndex) {
    const data = villageData[vIndex];

    if (vIndex >= 2 && gameState.hasEverDestroyed && !gameState.isFateLocked) {
        triggerFateLock(vIndex);
        return;
    }

    updateText(`<b>【ビーコンの前で】</b>\n\n${data.beaconIntro}`);

    let options = [
        { id: 'REPAIR', isMajor: true, text: `【修理】${data.victim}を捧げる`, action: () => resolveVillage(vIndex, 'REPAIR') },
        { id: 'DESTROY', isMajor: true, text: "【破壊】装置を壊す", action: () => resolveVillage(vIndex, 'DESTROY') }
    ];

    if (data.specialCondition(gameState)) {
        options.push({ id: 'SPECIAL', isSpecial: true, text: data.specialLabel, action: () => resolveVillage(vIndex, 'SPECIAL') });
    }

    if (getIntensityTier(vIndex) === 'C') {
        options.push({
            text: "……ここで、すべてを終わらせる",
            action: () => triggerSelfTermination(vIndex)
        });
    }

    startDecisionTimer();
    setChoices(options);
}

function resolveVillage(vIndex, type) {
    recordDecisionSpeed(vIndex, 'beacon');
    const data = villageData[vIndex];

    let monologue = "";
    if (type === 'REPAIR' && gameState.firstDestructionVillage !== null) {
        const distance = Math.max(1, Math.min(5, vIndex - gameState.firstDestructionVillage));
        monologue = "\n\n" + repairAfterDestroyMonologue[distance];
    }

    gameState.villageHistory.push({ village: vIndex, action: type });

    if (type === 'REPAIR') {
        gameState.repairedCount++;
        gameState.victims.push({
            name: data.victim, village: vIndex, villageName: data.name,
            epilogue: data.repairEpilogue, epilogueDeep: data.repairEpilogueDeep, read: false
        });
        updateUI();
        updateText(data.repairText + monologue);
    } else if (type === 'DESTROY') {
        gameState.hasEverDestroyed = true;
        gameState.destroyCount++;

        let despairFlavor = "";
        if (gameState.firstDestructionVillage === null) {
            gameState.firstDestructionVillage = vIndex;
            gameState.despairType = getDespairName(vIndex);
            despairFlavor = "\n\n" + gameState.despairType.flavor;
        }

        const intensity = getDestroyIntensity(vIndex);
        const destroyText = data.destroyTextByIntensity[intensity] || data.destroyTextByIntensity[1];

        gameState.victims.push({
            name: data.victim, village: vIndex, villageName: data.name,
            epilogue: data.destroyEpilogue, read: false
        });
        triggerDestroyEffect(30);
        updateUI();
        updateText(destroyText + despairFlavor);
    } else if (type === 'SPECIAL') {
        gameState.worldSaturation -= 5;
        gameState.repairedCount++;
        if (data.specialGrantsCompanion) {
            gameState.companions.push(data.specialGrantsCompanion);
        }
        updateUI();
        updateText(data.specialText);
    }

    const nextIndex = vIndex + 1;
    const nextVillageName = villageData[nextIndex]?.name;

    setChoices([{
        text: (nextIndex <= window.MAX_IMPLEMENTED_VILLAGE && nextVillageName)
            ? `${nextVillageName}へ旅立つ`
            : (nextIndex > 9 ? "王都グラドへ向かう" : "この先は準備中です"),
        action: () => {
            recordSkippedTopics(vIndex);
            if (nextIndex > 9 && typeof startFinale === 'function') {
                startFinale();
            } else if (nextIndex <= window.MAX_IMPLEMENTED_VILLAGE) {
                startVillage(nextIndex);
            }
        }
    }]);
}

function recordSkippedTopics(vIndex) {
    const data = villageData[vIndex];
    data.topics.forEach(t => {
        if (!t.visited && !t.isRumorTopic) {
            gameState.skippedTopics.push({ village: vIndex, villageName: data.name, label: t.label });
        }
    });
}

function triggerFateLock(vIndex) {
    const tier = getIntensityTier(vIndex);
    const d = fateLockDialogue[tier];

    updateText(`<b>【運命の宣告】</b>\n\n${d.intro}`);

    const container = document.getElementById('choices-container');
    container.innerHTML = '';

    const makeFateButton = (label, trueVoice, lockAction) => {
        const btn = document.createElement('button');
        btn.className = 'choice-button';
        btn.innerText = label;
        btn.onclick = () => {
            btn.disabled = true;
            btn.innerText = trueVoice;
            setTimeout(() => { lockAction(); }, 200);
        };
        return btn;
    };

    startDecisionTimer();

    container.appendChild(makeFateButton(d.repairLabel, d.repairTrueVoice, () => {
        recordDecisionSpeed(vIndex, 'fateLock');
        gameState.isFateLocked = true; gameState.lockedChoiceID = 'REPAIR';
        gameState.worldSaturation = Math.min(100, gameState.worldSaturation + 10);
        updateUI();
        renderBeacon(vIndex);
    }));

    container.appendChild(makeFateButton(d.destroyLabel, d.destroyTrueVoice, () => {
        recordDecisionSpeed(vIndex, 'fateLock');
        gameState.isFateLocked = true; gameState.lockedChoiceID = 'DESTROY';
        updateUI();
        renderBeacon(vIndex);
    }));
}

function triggerSelfTermination(vIndex) {
    recordDecisionSpeed(vIndex, 'selfTermination');
    const d = gameState.despairType || { title: "名もなき絶望", flavor: "" };
    const scene = selfTerminationTextsByVillage[vIndex] || selfTerminationTextsByVillage[7];
    updateText(`<b>【${d.title}】</b>\n\n${d.flavor}\n\n${scene}\n\nここで、すべてが止まった。`);
    setChoices([{ text: "最初からやり直す", action: () => location.reload() }]);
}

function startVillage(vIndex) {
    gameState.currentVillageIndex = vIndex;
    gameState.hasFoundSecret = false;

    gameState.entryDoucho = gameState.totalDoucho;
    gameState.entrySaturation = gameState.worldSaturation;
    gameState.entryLevel = calcEntryLevel(gameState.entryDoucho, gameState.entrySaturation);

    villageData[vIndex].topics.forEach(t => t.visited = false);
    updateUI();

    const data = villageData[vIndex];
    const entryText = pickByEntryLevel(data.entryTextByLevel);
    updateText(`<b>【第${vIndex}の村：${data.name}】</b>\n\n${entryText}`);
    renderExploration(vIndex);
}

/**
 * プロローグ：単眼鏡は「触れて確かめる」形式
 */
function startStory() {
    updateUI();
    updateText("<b>【プロローグ：勇者の凱旋】</b>\n\n17年前、世界は『魔王』の呪いによって滅びかけていた。\n魔物は大地を喰らい、空は永遠に夜のまま。人々は死を待つだけの存在だった。\n\nそこへ現れたのが、君の父だ。\n父は一人で魔王の城へ乗り込み、死闘の末に魔王の首を撥ねた。\n人々は父を『光の勇者』として称え、世界に17年の平穏が訪れた。");

    setChoices([
        { text: "父が遺した平和を振り返る", action: prologueStep2 }
    ]);
}

function prologueStep2() {
    updateText("父は10個の『ビーコン』を各地に設置し、魔王の呪いを聖なる光で上書きした。\n光り輝く村で、人々は何の不自由もなく、平和を信じて育った。\n\nだが、昨日。英雄と呼ばれた父は静かに息を引き取った。\n最期に耳元で遺した言葉は、祝福ではなく謝罪だった。\n\n「……すまない、息子よ」");

    setChoices([
        { text: "父の書斎へ向かう", action: prologueMonocleChoice }
    ]);
}

function prologueMonocleChoice() {
    updateText(`机の上には、旅の準備に必要そうなものがいくつか並んでいた。父の私物も、そのままにされている。\n\n古びた<span class='hidden-word' data-secret='monocle'>単眼鏡</span>が、その中に紛れて置かれていた。`);
    attachMonocleHandler();

    setChoices([
        { text: "身支度を整え、村を出る", action: () => startVillage(1) }
    ]);
}

function attachMonocleHandler() {
    const el = document.querySelector('[data-secret="monocle"]');
    if (!el) return;
    el.onclick = () => {
        if (gameState.hasMonocle) return;
        gameState.hasMonocle = true;
        el.onclick = null;
        const box = document.getElementById('text-box');
        box.innerHTML += "<br><br>単眼鏡を、そっと手に取った。古びたレンズの重みが、手のひらに伝わってきた。";
    };
}

// 全ファイルの読み込みが終わったら物語を開始する
window.addEventListener('load', () => {
    startStory();
});
