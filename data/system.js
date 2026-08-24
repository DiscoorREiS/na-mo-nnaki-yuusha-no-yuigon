/**
 * ============================================================
 * system.js
 * ゲームの土台となるロジック（状態管理・UI更新・共通関数）
 * 仲間の勧誘・レベル・破壊時の被害判定もここに統合されている。
 * ============================================================
 */

window.onerror = function(message, source, lineno, colno, error) {
    const box = document.getElementById('text-box');
    if (box) {
        // sourceにはエラーが起きたファイルのURLが入っている。ファイル名だけ抜き出して表示する。
        const fileName = source ? source.split('/').pop() : "不明なファイル";
        box.innerHTML = `<div class="error-box"><b>【システムエラーが発生しました】</b><br>以下の内容をそのまま開発者に伝えてください。<br><br>ファイル: ${fileName}<br>Message: ${message}<br>Line: ${lineno}, Col: ${colno}</div>`;
    }
    return false;
};

const gameState = {
    currentVillageIndex: 1,
    isFateLocked: false,
    lockedChoiceID: null,
    hasEverDestroyed: false,
    destroyCount: 0,
    repairedCount: 0,
    doucho: 0,
    totalDoucho: 0,
    investigation: 0,
    worldSaturation: 100,
    companions: [],       // 表示用の名前リスト（既存互換）
    fighters: [],          // 戦闘用の詳細データ { name, level, exp, condition }
    victims: [],
    villageHistory: [],
    hasFoundSecret: false,
    monocleAbandoned: false,
    hasMonocle: false,
    firstDestructionVillage: null,
    despairType: null,
    decisionSpeedLog: [],
    skippedTopics: [],
    entryDoucho: 0,
    entrySaturation: 100,
    entryLevel: 'low'
};

if (typeof window.villageData === 'undefined') {
    window.villageData = {};
}
const villageData = window.villageData;

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
