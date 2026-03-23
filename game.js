// ========== CONFIG ==========
const GACHA_ITEMS = [
    { id: 1, img: 'images/img1.png', name: 'No.001', rarity: 'SSR' },
    { id: 2, img: 'images/img2.png', name: 'No.002', rarity: 'SSR' },
    { id: 3, img: 'images/img3.png', name: 'No.003', rarity: 'SR' },
    { id: 4, img: 'images/img4.png', name: 'No.004', rarity: 'SR' },
    { id: 5, img: 'images/img5.png', name: 'No.005', rarity: 'SR' },
    { id: 6, img: 'images/img6.png', name: 'No.006', rarity: 'R' },
    { id: 7, img: 'images/img7.png', name: 'No.007', rarity: 'R' },
    { id: 8, img: 'images/img8.png', name: 'No.008', rarity: 'R' },
    { id: 9, img: 'images/img9.png', name: 'No.009', rarity: 'N' },
    { id: 10, img: 'images/img10.png', name: 'No.010', rarity: 'N' },
];

const LOCKED_ITEMS = [
    { id: 11, name: 'Patreon限定 No.011', rarity: 'SSR' },
    { id: 12, name: 'Patreon限定 No.012', rarity: 'SR' },
    { id: 13, name: 'Patreon限定 No.013', rarity: 'SSR' },
];

const RARITY_WEIGHTS = { SSR: 1, SR: 9, R: 30, N: 60 };
const PATREON_URL = 'https://www.patreon.com/cw/MuscleLove';

// ========== STATE ==========
let pullCount = 0;
let collection = new Set();
let isSpinning = false;
let audioCtx = null;

// Load saved state
try {
    const saved = JSON.parse(localStorage.getItem('muscleGacha'));
    if (saved) {
        pullCount = saved.pullCount || 0;
        collection = new Set(saved.collection || []);
    }
} catch (e) {}

// ========== DOM ==========
const slotReel = document.getElementById('slot-reel');
const gachaBtn = document.getElementById('gacha-btn');
const shareBtn = document.getElementById('share-btn');
const pullCountEl = document.getElementById('pull-count');
const pullCountEnEl = document.getElementById('pull-count-en');
const resultArea = document.getElementById('result-area');
const resultImage = document.getElementById('result-image');
const resultImageWrapper = document.getElementById('result-image-wrapper');
const resultRarity = document.getElementById('result-rarity');
const resultName = document.getElementById('result-name');
const rarityLabel = document.getElementById('rarity-label');
const collectionGrid = document.getElementById('collection-grid');
const collectionCount = document.getElementById('collection-count');
const screenFlash = document.getElementById('screen-flash');
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');

// ========== AUDIO ==========
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSpinSound() {
    if (!audioCtx) return;
    const duration = 2.0;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    const now = audioCtx.currentTime;
    // Rapid descending notes - ピロロロ
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.5);
    osc.frequency.linearRampToValueAtTime(600, now + 1.0);
    osc.frequency.linearRampToValueAtTime(400, now + 1.5);
    osc.frequency.linearRampToValueAtTime(300, now + 2.0);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.04, now + duration);
    osc.start(now);
    osc.stop(now + duration);
}

function playRevealSound(rarity) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    if (rarity === 'SSR' || rarity === 'SR') {
        // ジャーン！ - dramatic fanfare
        const freqs = rarity === 'SSR' ? [523, 659, 784, 1047] : [440, 554, 659];
        freqs.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = rarity === 'SSR' ? 'sawtooth' : 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + i * 0.12);
            gain.gain.linearRampToValueAtTime(0.08, now + i * 0.12 + 0.3);
            gain.gain.linearRampToValueAtTime(0, now + i * 0.12 + 0.8);
            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.8);
        });
    } else {
        // Simple ding
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    }
}

// ========== GACHA LOGIC ==========
function rollRarity() {
    const rand = Math.random() * 100;
    if (rand < RARITY_WEIGHTS.SSR) return 'SSR';
    if (rand < RARITY_WEIGHTS.SSR + RARITY_WEIGHTS.SR) return 'SR';
    if (rand < RARITY_WEIGHTS.SSR + RARITY_WEIGHTS.SR + RARITY_WEIGHTS.R) return 'R';
    return 'N';
}

function getItemByRarity(rarity) {
    const pool = GACHA_ITEMS.filter(item => item.rarity === rarity);
    return pool[Math.floor(Math.random() * pool.length)];
}

// ========== SPIN ANIMATION ==========
function buildReel(finalItem) {
    slotReel.innerHTML = '';
    // Build a long reel: 30 random images + final item
    const reelItems = [];
    for (let i = 0; i < 30; i++) {
        const randomItem = GACHA_ITEMS[Math.floor(Math.random() * GACHA_ITEMS.length)];
        reelItems.push(randomItem);
    }
    reelItems.push(finalItem);

    reelItems.forEach(item => {
        const img = document.createElement('img');
        img.src = item.img;
        img.alt = item.name;
        img.draggable = false;
        slotReel.appendChild(img);
    });

    return reelItems.length;
}

async function spinAnimation(finalItem) {
    const totalItems = buildReel(finalItem);
    const itemHeight = slotReel.querySelector('img').offsetHeight || 240;
    const finalOffset = (totalItems - 1) * itemHeight;

    slotReel.style.transition = 'none';
    slotReel.style.transform = 'translateY(0)';

    // Force reflow
    slotReel.offsetHeight;

    return new Promise(resolve => {
        // Use cubic-bezier for slot machine feel (fast start, slow stop)
        slotReel.style.transition = `transform 2.5s cubic-bezier(0.15, 0.8, 0.2, 1)`;
        slotReel.style.transform = `translateY(-${finalOffset}px)`;

        setTimeout(resolve, 2500);
    });
}

// ========== EFFECTS ==========
function triggerScreenFlash() {
    screenFlash.classList.remove('active');
    void screenFlash.offsetWidth;
    screenFlash.classList.add('active');
}

function showDramaticText(text, textEn) {
    const el = document.createElement('div');
    el.className = 'ssr-dramatic';
    el.innerHTML = text + (textEn ? '<span class="ssr-dramatic-en">' + textEn + '</span>' : '');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

function createSparkles(count) {
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const spark = document.createElement('div');
            spark.className = 'sparkle-particle';
            spark.style.left = Math.random() * window.innerWidth + 'px';
            spark.style.top = Math.random() * window.innerHeight * 0.6 + window.innerHeight * 0.2 + 'px';
            spark.style.animationDuration = (0.5 + Math.random() * 1) + 's';
            document.body.appendChild(spark);
            setTimeout(() => spark.remove(), 1500);
        }, i * 50);
    }
}

// ========== CONFETTI ==========
let confettiPieces = [];
let confettiRunning = false;

function launchConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    confettiPieces = [];
    const colors = ['#ff2d78', '#ffd700', '#00e5ff', '#b44dff', '#ff6b35', '#00ff88'];

    for (let i = 0; i < 120; i++) {
        confettiPieces.push({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 1) * 15 - 5,
            w: Math.random() * 10 + 4,
            h: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 10,
            gravity: 0.3 + Math.random() * 0.2,
            life: 1,
        });
    }

    if (!confettiRunning) {
        confettiRunning = true;
        animateConfetti();
    }
}

function animateConfetti() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = false;

    confettiPieces.forEach(p => {
        if (p.life <= 0) return;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.99;
        p.rotation += p.rotSpeed;
        p.life -= 0.008;

        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.globalAlpha = Math.max(0, p.life);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        confettiCtx.restore();
    });

    if (alive) {
        requestAnimationFrame(animateConfetti);
    } else {
        confettiRunning = false;
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
}

// ========== RESULT DISPLAY ==========
function showResult(item) {
    resultArea.style.display = 'flex';
    resultImage.src = item.img;

    // Remove old border classes
    resultImageWrapper.className = 'result-image-wrapper';
    resultImageWrapper.classList.add(`border-${item.rarity.toLowerCase()}`);

    // Rarity label
    resultRarity.textContent = item.rarity;
    resultRarity.className = `result-rarity ${item.rarity.toLowerCase()}`;
    resultName.textContent = item.name;

    // Re-trigger animation
    const card = document.getElementById('result-card');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = 'resultPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    // Rarity label in machine
    rarityLabel.textContent = item.rarity;
    rarityLabel.className = `rarity-label show ${item.rarity.toLowerCase()}`;

    // Effects based on rarity
    if (item.rarity === 'SSR') {
        triggerScreenFlash();
        showDramaticText('SSR出た！', 'SSR GET!');
        launchConfetti();
        createSparkles(30);
    } else if (item.rarity === 'SR') {
        createSparkles(15);
    }

    // Share button
    shareBtn.style.display = 'flex';
}

// ========== COLLECTION ==========
function updateCollection() {
    collectionCount.textContent = collection.size;
    collectionGrid.innerHTML = '';

    // Regular items
    GACHA_ITEMS.forEach(item => {
        const div = document.createElement('div');
        if (collection.has(item.id)) {
            div.className = 'collection-item unlocked';
            const img = document.createElement('img');
            img.src = item.img;
            img.alt = item.name;
            img.draggable = false;
            div.appendChild(img);

            const badge = document.createElement('span');
            badge.className = `rarity-badge ${item.rarity.toLowerCase()}`;
            badge.textContent = item.rarity;
            div.appendChild(badge);
        } else {
            div.className = 'collection-item not-collected';
            const q = document.createElement('span');
            q.className = 'question-mark';
            q.textContent = '？';
            div.appendChild(q);
        }
        collectionGrid.appendChild(div);
    });

    // Locked Patreon items
    LOCKED_ITEMS.forEach(item => {
        const div = document.createElement('div');
        div.className = 'collection-item locked';
        div.addEventListener('click', () => {
            window.open(PATREON_URL, '_blank');
        });

        const icon = document.createElement('span');
        icon.className = 'lock-icon';
        icon.textContent = '🔒';
        div.appendChild(icon);

        const text = document.createElement('span');
        text.className = 'lock-text';
        text.textContent = 'Patreonで\n限定解放！';
        div.appendChild(text);

        const textEn = document.createElement('span');
        textEn.className = 'lock-text-en';
        textEn.textContent = 'Unlock on\nPatreon!';
        div.appendChild(textEn);

        collectionGrid.appendChild(div);
    });
}

function saveState() {
    try {
        localStorage.setItem('muscleGacha', JSON.stringify({
            pullCount,
            collection: [...collection],
        }));
    } catch (e) {}
}

// ========== SHARE ==========
function shareResult(item) {
    const rarityEmoji = { SSR: '🌈', SR: '✨', R: '🔷', N: '▫️' };
    const emoji = rarityEmoji[item.rarity] || '';
    const text = `【筋肉ガチャ / Muscle Gacha】${item.rarity}${emoji}キタ！💪 ${pullCount}回目で${item.rarity}引いた！\nGot ${item.rarity} on Pull #${pullCount}!\nコレクション / Collection：${collection.size}/13\n#MuscleLove #筋肉ガチャ #MuscleGacha`;
    const url = encodeURIComponent(text);
    window.open(`https://twitter.com/intent/tweet?text=${url}`, '_blank');
}

// ========== MAIN GACHA FLOW ==========
let lastResult = null;

async function pullGacha() {
    if (isSpinning) return;
    isSpinning = true;
    gachaBtn.disabled = true;
    shareBtn.style.display = 'none';
    resultArea.style.display = 'none';
    rarityLabel.className = 'rarity-label';

    initAudio();
    playSpinSound();

    // Roll
    const rarity = rollRarity();
    const item = getItemByRarity(rarity);

    pullCount++;
    pullCountEl.textContent = pullCount;
    pullCountEnEl.textContent = pullCount;

    // Animate
    await spinAnimation(item);

    // Reveal
    playRevealSound(rarity);
    collection.add(item.id);
    showResult(item);
    updateCollection();
    saveState();
    lastResult = item;

    isSpinning = false;
    gachaBtn.disabled = false;
}

// ========== EVENT LISTENERS ==========
gachaBtn.addEventListener('click', pullGacha);
shareBtn.addEventListener('click', () => {
    if (lastResult) shareResult(lastResult);
});

// ========== INIT ==========
pullCountEl.textContent = pullCount;
pullCountEnEl.textContent = pullCount;
updateCollection();

// Preload images
GACHA_ITEMS.forEach(item => {
    const img = new Image();
    img.src = item.img;
});
