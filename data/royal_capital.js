/**
 * ============================================================
 * royal_capital.js
 * 最終地：王都グラド。父との対峙、真実の開示部分。
 * 破壊ルートはこの先、demon_king.js（未実装）へ接続する。
 * 修理ルートはこのファイル内でエンディングまで完結する。
 * ============================================================
 */

function startFinale() {
    updateUI();
    updateText("<b>【最終地：王都グラド】</b>\n\n長い旅の果てに、ついに王都の門が見えた。\n17年前、父がここから旅立ち、そしてここへ帰ってきたはずの場所。\n\n門をくぐると、静まり返った大通りの奥に、王城が見えた。");
    setChoices([
        { text: "王城へ向かう", action: finaleStep2 }
    ]);
}

function finaleStep2() {
    let text = "王城の最奥、玉座の間に辿り着いた。\n";

    if (gameState.hasEverDestroyed) {
        text += "そこにいたのは、王でも魔王でもなかった。\n\n骨ばった手をこちらに向け、父の面影を色濃く残した『何か』が、静かに立っていた。\n「……よく、ここまで来たな」";
    } else {
        text += "そこには、穏やかな光に包まれた玉座があった。\n座っているのは、亡くなったはずの父によく似た、光の残像だった。\n「……よく、ここまで来たな」";
    }

    updateText(text);
    setChoices([
        { text: "父（の残したもの）と対話する", action: finaleFatherDialogue }
    ]);
}

function finaleFatherDialogue() {
    let text = "";

    if (gameState.hasEverDestroyed) {
        text = "「魔王を、私は倒せなかった」\n\n父の声は、静かにそう告げた。\n「私がやったのは、ただ一つ。世界中の目に、見えないための膜を張っただけだ。魔王は、今もどこかで生き続けている」\n\n「すまない。すまなかった。だが、これ以上は、もう隠しきれない」";
    } else {
        text = "「よく、頑張ったな」\n\n父の残像は、穏やかにそう告げた。\n「お前が守り続けてくれたおかげで、多くの者が、知らないままでいられた。それが、良かったのかどうかは、私には分からない」\n\n「すまない。それでも、ありがとう」";
    }

    updateText(text);

    if (gameState.hasEverDestroyed) {
        setChoices([
            { text: "魔王のもとへ向かう", action: () => {
                if (typeof startDemonKingRoute === 'function') {
                    startDemonKingRoute();
                } else {
                    updateText("（魔王討伐パートは準備中です。しばらくお待ちください）");
                    setChoices([{ text: "最初からやり直す", action: () => location.reload() }]);
                }
            }}
        ]);
    } else {
        setChoices([
            { text: "この場所に留まり続ける", action: finaleRepairEnding }
        ]);
    }
}

/**
 * 修理ルート専用の結末（王都で完結）
 * 破壊ルートは demon_king.js 側でエンディングを持つ想定
 */
function finaleRepairEnding() {
    let title, body;

    if (gameState.repairedCount >= 8) {
        title = "【ED：黄金の檻の王】";
        body = "父の跡を継ぎ、世界の『平和』を守り抜いた。\n数えきれないほどの名を、名簿に刻みながら。\n\n世界は今日も、鮮やかに輝いている。誰もそれが、何の上に成り立っているかを知らないまま。";
    } else {
        title = "【ED：継承された後悔】";
        body = "父と同じ道を、途中までしか歩けなかった。\nいくつかの村では嘘を守り、いくつかの記憶は、単眼鏡の中に留めた。\n\n完全な嘘でも、完全な真実でもない、綻びだらけの世界を、それでも歩き続けていくしかなかった。";
    }

    updateText(`<b>${title}</b>\n\n${body}\n\n犠牲者数: ${gameState.victims.length}\n世界の色彩: ${gameState.worldSaturation}%\n同行者: ${gameState.companions.length > 0 ? gameState.companions.join('・') : "なし"}`);
    setChoices([{ text: "最初からやり直す", action: () => location.reload() }]);
}
