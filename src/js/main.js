// オーディオ管理クラス
class AudioManager {
    constructor() {
        this.sfxContext = null; this.sfxGain = null; this.tickInterval = null;
    }

    async initSfx() {
        if (this.sfxContext) return;
        try {
            this.sfxContext = new (window.AudioContext || window.webkitAudioContext)();
            this.sfxGain = this.sfxContext.createGain();
            this.sfxGain.connect(this.sfxContext.destination); this.sfxGain.gain.value = 0.4;
        } catch (e) { console.error("Web Audio API is not supported for SFX."); }
    }

    playSfx(notes, durations, type = 'sine') {
        if (!this.sfxContext) return;
        let time = this.sfxContext.currentTime;
        notes.forEach((freq, i) => {
            if (freq > 0) {
                const osc = this.sfxContext.createOscillator(); const gain = this.sfxContext.createGain();
                osc.connect(gain); gain.connect(this.sfxGain); osc.type = type;
                osc.frequency.setValueAtTime(freq, time); gain.gain.setValueAtTime(0.5, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + durations[i]);
                osc.start(time); osc.stop(time + durations[i]);
            }
            time += durations[i];
        });
    }

    playCorrectSound() { this.playSfx([783.99, 1046.50], [0.1, 0.4]); }
    playIncorrectSound() { this.playSfx([293.66, 261.63, 233.08, 207.65], [0.1, 0.1, 0.1, 0.4], 'sawtooth'); }
    playCountdownSound(isStart = false) { this.playSfx([isStart ? 880 : 440], [0.3]); }
    playGameOverSound() { this.playSfx([130, 110, 98], [0.4, 0.4, 1.0], 'sawtooth'); }

    // 時計のチクタク音を再生
    playTickSound() {
        if (!this.sfxContext) return;
        const time = this.sfxContext.currentTime;
        const osc = this.sfxContext.createOscillator();
        const gain = this.sfxContext.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, time);
        gain.gain.setValueAtTime(0.1, time); // 小さめの音量
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);
    }

    playTransitionBGM(callback) {
        if (!this.sfxContext) {
            setTimeout(callback, 4000); // オーディオが使えない場合は4秒待って次に進む
            return;
        }
        const BPM = 150; const eighthNoteTime = 60 / BPM / 2;
        const melody = [{ f: 523, d: 2 }, { f: 587, d: 2 }, { f: 659, d: 2 }, { f: 587, d: 2 }, { f: 659, d: 2 }, { f: 783, d: 2 }, { f: 659, d: 2 }, { f: 587, d: 2 }, { f: 523, d: 2 }, { f: 440, d: 2 }, { f: 523, d: 4 }];
        const bass = [{ f: 261, d: 4 }, { f: 329, d: 4 }, { f: 392, d: 4 }, { f: 220, d: 4 }];
        const time = this.sfxContext.currentTime; let currentTime = time;
        melody.forEach(note => {
            const osc = this.sfxContext.createOscillator(); const gain = this.sfxContext.createGain(); osc.connect(gain); gain.connect(this.sfxGain); osc.type = 'square';
            gain.gain.setValueAtTime(0.15, currentTime); osc.frequency.setValueAtTime(note.f, currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, currentTime + note.d * eighthNoteTime * 0.9);
            osc.start(currentTime); osc.stop(currentTime + note.d * eighthNoteTime); currentTime += note.d * eighthNoteTime;
        });
        currentTime = time;
        bass.forEach(note => {
            const osc = this.sfxContext.createOscillator(); const gain = this.sfxContext.createGain(); osc.connect(gain); gain.connect(this.sfxGain); osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.2, currentTime); osc.frequency.setValueAtTime(note.f, currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, currentTime + note.d * eighthNoteTime * 0.9);
            osc.start(currentTime); osc.stop(currentTime + note.d * eighthNoteTime); currentTime += note.d * eighthNoteTime;
        });
        setTimeout(callback, 4000);
    }
}

// ゲーム本体クラス
class GeographyGame {
    constructor() {
        this.score = 0; this.currentQuestionIndex = 0;
        this.lives = 4; this.plantGrowth = 0;
        this.audioManager = new AudioManager();
        this.questions = []; // ★変更点：最初は空の配列にしておく
    }

    // ★追加点：JSONファイルを読み込んでゲーム全体を初期化するメソッド
    async init() {
        await this.loadQuestions(); // 問題を非同期で読み込む
        if (this.questions.length === 0) return; // 問題がなければ終了

        this.shuffleArray(this.questions);
        this.bindEvents();
        this.showStartScreen();
        // 植木鉢の初期描画
        const pot = document.getElementById('plantPot');
        const leaves = document.getElementById('plantLeaves');
        pot.innerHTML = `<g transform="translate(25, 0)"><path fill="#000" d="M33 148 H67 V149 H68 V150 H69 V171 H68 V172 H65 V173 H35 V172 H32 V171 H31 V150 H32 V149 H33 V148"/><path fill="#d97706" d="M34 149 H66 V150 H34 V149 M33 150 H32 V171 H33 V150 M67 150 H68 V171 H67 V150 M35 172 H65 V171 H35 V172"/><path fill="#f59e0b" d="M34 150 H66 V171 H34 V150"/></g>`;
        leaves.innerHTML = this.getLeafSvg(0);
    }

    // ★追加点：questions.jsonを非同期で読み込むメソッド
    async loadQuestions() {
        try {
            const response = await fetch('questions.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.questions = await response.json();
        } catch (error) {
            console.error("問題ファイルの読み込みに失敗しました:", error);
            document.body.innerHTML = '<div style="color: white; text-align: center; padding: 50px; font-size: 1.2rem;">エラー: 問題ファイル(questions.json)を読み込めませんでした。<br>ファイルが正しい場所にあるか確認してください。</div>';
        }
    }

    // 配列をシャッフルする（Fisher-Yatesアルゴリズム）
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // (init()メソッドは上記でasync付きのものに置き換え済み)

    showStartScreen() {
        const startButton = document.getElementById('startButton');
        const countdownDisplay = document.getElementById('countdownDisplay');

        startButton.style.display = 'inline-block';
        countdownDisplay.textContent = '';
    }

    startCountdown() {
        const countdownDisplay = document.getElementById('countdownDisplay');
        let count = 3;
        const countdownInterval = setInterval(() => {
            if (count > 0) {
                countdownDisplay.textContent = count;
                this.audioManager.playCountdownSound();
                count--;
            } else {
                clearInterval(countdownInterval);
                countdownDisplay.textContent = 'スタート！';
                this.audioManager.playCountdownSound(true);
                setTimeout(() => {
                    document.getElementById('startScreen').classList.add('hidden');
                    this.showRuleScreen();
                }, 1000);
            }
        }, 1000);
    }

    showRuleScreen() {
        const ruleScreen = document.getElementById('ruleScreen');
        ruleScreen.classList.remove('hidden');

        const bubbles = document.querySelectorAll('#speechBubbles .speech-bubble');
        const button = document.getElementById('ruleConfirmBtn');

        bubbles.forEach((bubble, index) => {
            setTimeout(() => {
                bubble.style.opacity = '1';
                bubble.style.transform = 'translateY(0)';
            }, index * 1200);
        });

        setTimeout(() => {
            button.style.opacity = '1';
        }, bubbles.length * 1200);
    }

    transitionToNextQuestion(isCorrect) {
        const lifeScreen = document.getElementById('lifeScreen');
        lifeScreen.classList.remove('hidden');

        this.updateLivesDisplay();
        this.updatePlant(isCorrect); // 正解したかどうかを渡して植物の状態を更新

        const nextQuestionDisplay = document.getElementById('nextQuestionDisplay');
        nextQuestionDisplay.textContent = `NEXT ${String(this.currentQuestionIndex + 1).padStart(2, '0')}`;

        this.audioManager.playTransitionBGM(() => {
            lifeScreen.classList.add('hidden');
            this.showGameScreen();
        });
    }

    // ライフ（ハート）を表示/更新
    updateLivesDisplay(animateLoss = false) {
        const livesContainer = document.getElementById('livesContainer');
        const hearts = livesContainer.children;

        if (animateLoss && this.lives < 4 && hearts.length > 0) {
            const heartToLose = hearts[this.lives];
            if (heartToLose) {
                const heartRect = heartToLose.getBoundingClientRect();
                const fallingHeart = heartToLose.cloneNode(true);
                fallingHeart.classList.add('heart-fall');
                fallingHeart.style.left = `${heartRect.left}px`;
                fallingHeart.style.top = `${heartRect.top}px`;
                document.body.appendChild(fallingHeart);
                setTimeout(() => fallingHeart.remove(), 1000);
            }
        }

        livesContainer.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const heart = document.createElement('div');
            const isLost = i >= this.lives;
            const heartSVG = `
            <svg width="80" height="80" viewBox="0 0 32 32">
                <defs>
                    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#FFDF00;" />
                        <stop offset="100%" style="stop-color:#B8860B;" />
                    </linearGradient>
                    <clipPath id="heart-clip-path"><path d="M16 28.7c-5.4-4.8-12-8.5-12-14.2 0-3.6 2.2-6.5 6-6.5 3.3 0 6 2.7 6 2.7s2.7-2.7 6-2.7c3.8 0 6 2.9 6 6.5 0 5.7-6.6 9.4-12 14.2z"/></clipPath>
                </defs>
                <path fill="${isLost ? '#1F2937' : 'url(#goldGradient)'}" stroke="#422c09" stroke-width="1.5" d="M16 28.7c-5.4-4.8-12-8.5-12-14.2 0-3.6 2.2-6.5 6-6.5 3.3 0 6 2.7 6 2.7s2.7-2.7 6-2.7c3.8 0 6 2.9 6 6.5 0 5.7-6.6 9.4-12 14.2z"/>
                ${!isLost ? `<g clip-path="url(#heart-clip-path)"><rect class="golden-heart-glint" x="-32" y="0" width="16" height="32" fill="rgba(255, 255, 255, 0.5)"/></g>` : ''}
            </svg>`;
            heart.innerHTML = heartSVG;
            livesContainer.appendChild(heart);
        }
    }

    // 植物の成長アニメーションや状態変化を管理
    updatePlant(wasCorrect) {
        const wateringCan = document.getElementById('wateringCan');
        const plantEffect = document.getElementById('plantEffect');
        const plantLeaves = document.getElementById('plantLeaves');

        plantEffect.className = 'absolute hidden rounded-full opacity-0 z-0';

        if (wasCorrect) { // 正解した場合
            wateringCan.classList.remove('hidden'); wateringCan.classList.add('animate'); // じょうろアニメーション
            plantEffect.classList.add('grow');
            plantEffect.classList.remove('hidden');

            setTimeout(() => this.growPlant(), 1000); // 1秒後に成長処理
            setTimeout(() => {
                wateringCan.classList.add('hidden');
                wateringCan.classList.remove('animate');
            }, 1500);
        } else { // 不正解または初回表示
            this.growPlant(false);
            if (this.currentQuestionIndex > 0) { // 初回以外で不正解なら萎れる
                // ★★★★★ 修正ここから ★★★★★
                const currentHeight = this.plantGrowth * 25;
                // 現在の葉の位置をCSSカスタムプロパティとして設定
                plantLeaves.style.setProperty('--wilt-start-y', `translate(0, ${-currentHeight}px)`);
                // しおれて少し下がる位置を設定
                plantLeaves.style.setProperty('--wilt-end-y', `translate(0, ${-currentHeight + 10}px)`);

                plantLeaves.classList.add('wilt');
                plantEffect.classList.add('wilt');
                plantEffect.classList.remove('hidden');

                setTimeout(() => {
                    plantLeaves.classList.remove('wilt');
                    // アニメーション後にカスタムプロパティを削除
                    plantLeaves.style.removeProperty('--wilt-start-y');
                    plantLeaves.style.removeProperty('--wilt-end-y');
                }, 1500);
                // ★★★★★ 修正ここまで ★★★★★
            }
        }
    }

    getLeafSvg() {
        const baseY = 150;
        // 葉の座標を固定値で描画（Yオフセット計算を削除）
        return `
            <path d="M73 ${baseY - 5} q -15 -5 -25 -20 q -5 -10 0 -15 q 5 5 15 10 q 15 10 10 25 Z" fill="#000"/>
            <path d="M72 ${baseY - 6} q -15 -5 -25 -20 q -5 -10 0 -15 q 5 5 15 10 q 15 10 10 25 Z" fill="#22C55E"/>
            <path d="M72 ${baseY - 6} q -10 -5 -15 -15" stroke="#166534" stroke-width="1.5" fill="none"/>
            <path d="M77 ${baseY - 5} q 15 -5 25 -20 q 5 -10 0 -15 q -5 5 -15 10 q -15 10 -10 25 Z" fill="#000"/>
            <path d="M78 ${baseY - 6} q 15 -5 25 -20 q 5 -10 0 -15 q -5 5 -15 10 q -15 10 -10 25 Z" fill="#22C55E"/>
            <path d="M78 ${baseY - 6} q 10 -5 15 -15" stroke="#166534" stroke-width="1.5" fill="none"/>
        `;
    }

    // 植物を成長させる処理
    growPlant(shouldGrow = true) {
        if (shouldGrow) this.plantGrowth++;

        const plantGroup = document.getElementById('plantGroup');
        const stem = document.getElementById('plantStem');
        const leaves = document.getElementById('plantLeaves');
        const flowersContainer = document.getElementById('flowersContainer');

        const growthAmount = 25;
        const newHeight = this.plantGrowth * growthAmount;
        const baseY = 150;

        // CSS Transitionを追加してアニメーションを滑らかにする
        stem.style.transition = 'height 0.5s ease-out, y 0.5s ease-out';
        leaves.style.transition = 'transform 0.5s ease-out';

        // 茎の高さとY座標を更新
        stem.setAttribute('height', newHeight);
        stem.setAttribute('y', baseY - newHeight);

        // 葉のSVGは初回のみ描画
        if (leaves.innerHTML === '') {
            leaves.innerHTML = this.getLeafSvg();
        }

        // 葉のコンテナを茎の成長分だけ上に移動させる
        leaves.setAttribute('transform', `translate(0, ${-newHeight})`);

        // 花を追加するロジック (花のコンテナ自体は動かさない)
        if (shouldGrow && this.plantGrowth > 0 && this.plantGrowth % 5 === 0) {
            const flowerY = baseY - (newHeight - growthAmount); // 花が咲く絶対Y座標
            const flowerX = 75 + (this.plantGrowth % 10 === 0 ? -20 : 20);
            const flower = document.createElementNS("http://www.w3.org/2000/svg", "g");
            flower.innerHTML = `
                <path fill="#000" d="M${flowerX - 9} ${flowerY - 4} h1 M${flowerX + 7} ${flowerY - 4} h1 M${flowerX - 9} ${flowerY + 4} h1 M${flowerX + 7} ${flowerY + 4} h1 M${flowerX - 4} ${flowerY - 9} v1 M${flowerX + 4} ${flowerY - 9} v1 M${flowerX - 4} ${flowerY + 7} v1 M${flowerX + 4} ${flowerY + 7} v1"/>
                <path fill="white" d="M${flowerX - 8} ${flowerY - 4} h1 M${flowerX + 7} ${flowerY - 4} h-1 M${flowerX - 8} ${flowerY + 3} h1 M${flowerX + 7} ${flowerY + 3} h-1 M${flowerX - 4} ${flowerY - 8} v1 M${flowerX + 3} ${flowerY - 8} v1 M${flowerX - 4} ${flowerY + 7} v-1 M${flowerX + 3} ${flowerY + 7} v-1"/>
                <rect x="${flowerX - 2}" y="${flowerY - 7}" width="4" height="2" fill="white"/><rect x="${flowerX - 2}" y="${flowerY + 5}" width="4" height="2" fill="white"/>
                <rect x="${flowerX - 7}" y="${flowerY - 2}" width="2" height="4" fill="white"/><rect x="${flowerX + 5}" y="${flowerY - 2}" width="2" height="4" fill="white"/>
                <rect x="${flowerX - 2}" y="${flowerY - 2}" width="4" height="4" fill="#FBBF24"/>
            `;
            flowersContainer.appendChild(flower);
        }

        // plantGroup全体のtransformは不要なため削除
        plantGroup.removeAttribute('transform');
    }

    showGameScreen() {
        document.getElementById('gameScreen').classList.remove('hidden');
        this.showQuestion(); this.startTimer();
    }

    bindEvents() {
        document.getElementById('startButton').onclick = async () => {
            await this.audioManager.initSfx();
            document.getElementById('startButton').style.display = 'none';
            this.startCountdown();
        };
        document.getElementById('restartBtn').addEventListener('click', () => window.location.reload());

        document.querySelectorAll('.choice-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectAnswer(e));
        });

        document.getElementById('ruleConfirmBtn').onclick = () => {
            document.getElementById('ruleScreen').classList.add('hidden');
            this.transitionToNextQuestion(false);
        };
    }

    showQuestion() {
        const question = this.questions[this.currentQuestionIndex];
        document.getElementById('questionText').textContent = question.title;

        const contentDiv = document.getElementById('questionContent');
        if (question.type === 'climate') {
            contentDiv.innerHTML = this.generateClimateChart(question.content.split('-')[1]);
        } else {
            contentDiv.innerHTML = `<img src="${question.content}" alt="問題画像" class="mx-auto pixel-border" style="width: 300px; height: 220px; object-fit: contain; background: #9376F0;">`;
        }

        const choiceBtns = document.querySelectorAll('.choice-btn');
        const colors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500'];
        const textColors = ['text-white', 'text-white', 'text-black', 'text-white'];

        choiceBtns.forEach((btn, index) => {
            btn.textContent = question.choices[index];
            btn.className = 'choice-btn pixel-button py-4 px-4 text-lg';
            btn.classList.add(colors[index], textColors[index]); btn.disabled = false;
            btn.style.cssText = ''; // Clear inline styles
        });
    }

    generateClimateChart(type) { const charts = { 'af': { temp: [180, 175, 170, 175, 180, 185, 190, 195, 190, 185, 180, 175], precip: [90, 85, 95, 100, 95, 90, 85, 80, 85, 90, 95, 90] }, 'aw': { temp: [170, 165, 160, 165, 170, 175, 180, 185, 180, 175, 170, 165], precip: [20, 15, 10, 5, 30, 80, 100, 95, 85, 60, 40, 25] }, 'bwh': { temp: [150, 140, 120, 100, 80, 70, 75, 85, 105, 125, 145, 155], precip: [5, 3, 2, 1, 1, 0, 0, 1, 2, 3, 4, 5] }, 'csa': { temp: [160, 150, 130, 110, 90, 75, 70, 75, 95, 115, 135, 155], precip: [80, 70, 60, 40, 20, 5, 2, 5, 25, 50, 70, 85] }, 'cfb': { temp: [170, 155, 140, 120, 100, 85, 80, 85, 105, 125, 145, 165], precip: [70, 65, 60, 55, 50, 45, 40, 45, 55, 65, 70, 75] } }; const data = charts[type]; let svg = `<svg width="300" height="220" class="mx-auto pixel-border" style="background: #9376F0;"><rect width="300" height="220" fill="#4A249D"/><rect x="30" y="180" width="240" height="3" fill="#F9E076"/><rect x="30" y="30" width="3" height="153" fill="#F9E076"/><text x="50" y="200" text-anchor="middle" class="text-xs fill-white" style="font-family: 'RocknRoll One';">1</text><text x="150" y="200" text-anchor="middle" class="text-xs fill-white" style="font-family: 'RocknRoll One';">6</text><text x="250" y="200" text-anchor="middle" class="text-xs fill-white" style="font-family: 'RocknRoll One';">12</text>`; for (let i = 0; i < 11; i++) { svg += `<rect x="${45 + i * 20}" y="${180 - (data.temp[i] - 50)}" width="8" height="8" fill="#F87171"/>`; } for (let i = 0; i < 11; i++) { svg += `<rect x="${42 + i * 20}" y="${180 - data.precip[i] / 2}" width="12" height="${data.precip[i] / 2}" fill="#60A5FA"/>`; } svg += `<rect x="40" y="15" width="12" height="3" fill="#F87171"/><text x="55" y="22" class="text-xs fill-white" style="font-family: 'RocknRoll One';">気温</text><rect x="120" y="15" width="8" height="8" fill="#60A5FA"/><text x="132" y="22" class="text-xs fill-white" style="font-family: 'RocknRoll One';">降水量</text></svg>`; return svg; }

    selectAnswer(e) {
        if (e.target.disabled) return;

        const isCorrect = parseInt(e.target.dataset.answer) === this.questions[this.currentQuestionIndex].correct;
        clearInterval(this.timer);
        document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = true);

        if (isCorrect) {
            this.audioManager.playCorrectSound();
            e.target.style.background = '#22c55e';
            e.target.style.backgroundImage = 'none'; this.score++;
            this.showResultSymbol('○', '#f87171');
        } else {
            this.audioManager.playIncorrectSound(); e.target.classList.add('shake');
            e.target.style.background = '#ef4444';
            e.target.style.backgroundImage = 'none';
            this.updateLivesDisplay(true);
            this.lives--;
            const correctBtn = document.querySelectorAll('.choice-btn')[this.questions[this.currentQuestionIndex].correct];
            correctBtn.style.background = '#22c55e';
            correctBtn.style.backgroundImage = 'none';
            this.showResultSymbol('×', '#60a5fa');
        }

        setTimeout(() => { this.nextStep(isCorrect); }, 1500);
    }

    showResultSymbol(symbol, color) {
        const overlay = document.getElementById('resultOverlay'); const symbolElement = document.getElementById('resultSymbol');
        symbolElement.textContent = symbol; symbolElement.style.color = color;
        overlay.classList.remove('hidden');
        setTimeout(() => { overlay.classList.add('hidden'); }, 1000);
    }

    startTimer() {
        this.timeLeft = 10;
        const timerBar = document.getElementById('timerBar'); const spark = document.getElementById('spark');
        const fuseContainer = document.getElementById('fuseContainer');
        timerBar.style.width = '100%';
        spark.style.left = `calc(100% - 12px)`;

        this.timer = setInterval(() => {
            this.timeLeft--;
            this.audioManager.playTickSound();
            const percentage = Math.max(0, this.timeLeft / 10);
            timerBar.style.width = `${percentage * 100}%`;
            spark.style.left = `calc(${percentage * 100}% - 12px)`;
            if (this.timeLeft <= 0) { clearInterval(this.timer); this.timeUp(); }
        }, 1000);
    }

    timeUp() {
        this.animateExplosion();
        document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = true);
        this.updateLivesDisplay(true);
        this.lives--;
        this.audioManager.playIncorrectSound();
        this.showResultSymbol('×', '#60a5fa');
        setTimeout(() => { this.nextStep(false); }, 1500);
    }

    animateExplosion() {
        const explosionEffect = document.getElementById('explosionEffect');
        explosionEffect.classList.remove('hidden');
        setTimeout(() => { explosionEffect.classList.add('hidden'); }, 400);
    }

    nextStep(isCorrect) {
        document.getElementById('gameScreen').classList.add('hidden');
        this.currentQuestionIndex++;
        if (this.currentQuestionIndex >= this.questions.length || this.lives <= 0) {
            this.showResult();
        } else {
            this.transitionToNextQuestion(isCorrect);
        }
    }

    // 最終結果を表示
    showResult() {
        document.getElementById('resultScreen').classList.remove('hidden');
        const resultTitleEl = document.getElementById('resultTitle');
        const resultMessageEl = document.getElementById('resultMessage');
        const plantMeasure = document.getElementById('plantMeasure');
        const plantHeightText = document.getElementById('plantHeightText');
        const finalPlantSvg = document.getElementById('finalPlantSvg');

        if (this.lives <= 0) {
            this.audioManager.playGameOverSound();
            resultTitleEl.innerHTML = '<div class="game-over-text">ゲームオーバー！</div>';
            resultMessageEl.textContent = 'またチャレンジしてね！';
        } else {
            resultTitleEl.textContent = 'ゲームクリア！';
            resultMessageEl.textContent = 'すごい！よくできました！';
        }

        const plantHeightCm = this.plantGrowth * 10;
        const growthHeight = this.plantGrowth * 25;

        // ★★★★★ 修正点 1 ★★★★★
        // SVGの表示領域の高さを、植物全体の高さ（茎＋葉＋鉢植え）に合わせる
        // これにより、不要な余白がなくなり、植物が正しく拡大表示される
        const totalSvgHeight = growthHeight + 50; // 50 = 鉢の高さ(約25) + 葉の高さ(約25)

        finalPlantSvg.setAttribute('viewBox', `0 0 150 ${totalSvgHeight}`);

        let flowersHtml = '';
        for (let i = 1; i <= this.plantGrowth; i++) {
            if (i > 0 && i % 5 === 0) {
                const flowerY = 150 - (i * 25 - 25);
                const flowerX = 75 + (i % 10 === 0 ? -20 : 15);
                flowersHtml += `<g><path fill="#000" d="M${flowerX - 9} ${flowerY - 4} h1 M${flowerX + 7} ${flowerY - 4} h1 M${flowerX - 9} ${flowerY + 4} h1 M${flowerX + 7} ${flowerY + 4} h1 M${flowerX - 4} ${flowerY - 9} v1 M${flowerX + 4} ${flowerY - 9} v1 M${flowerX - 4} ${flowerY + 7} v1 M${flowerX + 4} ${flowerY + 7} v1"/><path fill="white" d="M${flowerX - 8} ${flowerY - 4} h1 M${flowerX + 7} ${flowerY - 4} h-1 M${flowerX - 8} ${flowerY + 3} h1 M${flowerX + 7} ${flowerY + 3} h-1 M${flowerX - 4} ${flowerY - 8} v1 M${flowerX + 3} ${flowerY - 8} v1 M${flowerX - 4} ${flowerY + 7} v-1 M${flowerX + 3} ${flowerY + 7} v-1"/><rect x="${flowerX - 2}" y="${flowerY - 7}" width="4" height="2" fill="white"/><rect x="${flowerX - 2}" y="${flowerY + 5}" width="4" height="2" fill="white"/><rect x="${flowerX - 7}" y="${flowerY - 2}" width="2" height="4" fill="white"/><rect x="${flowerX + 5}" y="${flowerY - 2}" width="2" height="4" fill="white"/><rect x="${flowerX - 2}" y="${flowerY - 2}" width="4" height="4" fill="#FBBF24"/></g>`;
            }
        }

        // ★★★★★ 修正点 2 ★★★★★
        // 新しいviewBoxの高さに合わせて、植物全体を移動させる量を再計算
        const yTranslate = totalSvgHeight - 173; // 173は鉢の底のY座標

        finalPlantSvg.innerHTML = `
            <g transform="translate(0, ${yTranslate})">
                ${flowersHtml}
                <rect x="73" y="${150 - growthHeight}" width="4" height="${growthHeight}" fill="#22C55E" stroke="#166534" stroke-width="1"/>
                
                <g transform="translate(0, ${-growthHeight})">
                    ${this.getLeafSvg()}
                </g>
                
                <g transform="translate(25, 0)">
                    <path fill="#000" d="M33 148 H67 V149 H68 V150 H69 V171 H68 V172 H65 V173 H35 V172 H32 V171 H31 V150 H32 V149 H33 V148"/>
                    <path fill="#d97706" d="M34 149 H66 V150 H34 V149 M33 150 H32 V171 H33 V150 M67 150 H68 V171 H67 V150 M35 172 H65 V171 H35 V172"/>
                    <path fill="#f59e0b" d="M34 150 H66 V171 H34 V150"/>
                </g>
            </g>
        `;

        plantMeasure.innerHTML = '';
        if (plantHeightCm > 0) {
            const step = Math.max(10, Math.ceil(plantHeightCm / 100) * 10);
            for (let i = 0; i <= plantHeightCm; i += step) {
                plantMeasure.innerHTML += `<div class="absolute w-full border-t border-dashed border-gray-400" style="bottom: ${i / plantHeightCm * 100}%;"><span class="absolute right-full text-xs text-white -mr-1 -translate-y-1/2 pr-1">${i}</span></div>`;
            }
        }
        plantHeightText.textContent = `${plantHeightCm}cm`;
    }
}

// ★変更点：DOMContentLoadedのイベントリスナー内で、非同期のinitメソッドを呼び出すように変更
window.addEventListener('DOMContentLoaded', () => {
    const game = new GeographyGame();
    game.init();
});