class VoiceTranslator {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.isRecognitionActive = false;
        this.currentLanguage = 'ja'; // デフォルトは日本語
        this.detectedLanguage = null;
        this.history = JSON.parse(localStorage.getItem('translationHistory') || '[]');
        this.accumulatedText = '';
        this.wasListeningBeforeSpeaking = false; // スピーカー実行前のマイク状態を記録
        
        this.init();
    }

    init() {
        this.setupSpeechRecognition();
        this.setupEventListeners();
        this.loadHistory();
        this.updateLanguageIndicator(); // 初期状態の言語表示を設定
    }

    setupSpeechRecognition() {
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            alert('音声認識はHTTPS環境またはlocalhostでのみ動作します。');
            return;
        }

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('お使いのブラウザは音声認識をサポートしていません。');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognitionTimeout = null;
        this.retryCount = 0;
        this.maxRetries = 3;

        this.recognition.onstart = () => {
            console.log('音声認識開始');
            this.isRecognitionActive = true;
            if (this.currentLanguage === 'ja') {
                document.getElementById('japaneseStatus').textContent = '聞いています...';
            } else {
                document.getElementById('vietnameseStatus').textContent = 'Đang nghe...';
            }
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            // 最新の結果のみを取得
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // 個別言語認識モード
            if (finalTranscript) {
                this.handleSpeechResult(finalTranscript.trim());
            } else if (interimTranscript) {
                this.updateContent(this.currentLanguage, interimTranscript, true);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('音声認識エラー:', event.error);
            this.isRecognitionActive = false;
            let errorMessage = '';
            let shouldRetry = false;
            
            switch(event.error) {
                case 'network':
                    errorMessage = 'ネットワークエラーです。音声認識を停止します。';
                    break;
                case 'not-allowed':
                    errorMessage = 'マイクのアクセス許可が必要です。';
                    break;
                case 'no-speech':
                    if (this.retryCount < this.maxRetries) {
                        errorMessage = `音声が検出されませんでした (再試行 ${this.retryCount + 1}/${this.maxRetries})`;
                        shouldRetry = true;
                    } else {
                        errorMessage = '音声が検出されませんでした。再度お試しください。';
                    }
                    break;
                case 'audio-capture':
                    errorMessage = 'マイクにアクセスできません。';
                    break;
                default:
                    errorMessage = `音声認識エラー: ${event.error}`;
            }
            
            const currentLangElement = this.currentLanguage === 'ja' 
                ? document.getElementById('japaneseStatus') 
                : document.getElementById('vietnameseStatus');
            currentLangElement.textContent = errorMessage;
            currentLangElement.style.color = '#ff6b6b';
            
            if (shouldRetry && this.retryCount < this.maxRetries && this.isListening) {
                this.retryCount++;
                setTimeout(() => {
                    this.startRecognitionSafely();
                }, 2000);
            } else {
                setTimeout(() => {
                    currentLangElement.style.color = '';
                    this.updateStatus();
                }, 3000);
                this.stopListening();
            }
        };

        this.recognition.onend = () => {
            console.log('音声認識終了, isListening:', this.isListening, 'isRecognitionActive:', this.isRecognitionActive);
            this.isRecognitionActive = false;
            
            if (this.isListening && this.retryCount < this.maxRetries) {
                this.recognitionTimeout = setTimeout(() => {
                    if (this.isListening) {
                        console.log('音声認識再開, retry:', this.retryCount);
                        this.startRecognitionSafely();
                    }
                }, 1000);
            } else if (this.retryCount >= this.maxRetries) {
                console.log('最大リトライ回数に達しました');
                this.handleRecognitionFailure();
            }
        };
    }

    setupEventListeners() {
        // 言語切り替えボタン
        const languageToggle = document.getElementById('languageToggle');
        languageToggle.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchLanguage();
        });
        languageToggle.addEventListener('touchstart', (e) => {
            e.preventDefault();
        });
        languageToggle.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.switchLanguage();
        });
        
        // 音声認識ボタン
        const micButton = document.getElementById('micButton');
        micButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleMicClick();
        });
        micButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
        });
        micButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMicClick();
        });

        document.getElementById('historyBtn').addEventListener('click', () => {
            this.showHistory();
        });

        document.getElementById('closeHistoryBtn').addEventListener('click', () => {
            this.hideHistory();
        });

        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            this.clearHistory();
        });

        document.getElementById('historyModal').addEventListener('click', (e) => {
            if (e.target.id === 'historyModal') {
                this.hideHistory();
            }
        });

        // 文字出力ウィンドウのダブルタップで編集モード
        this.setupDoubleTabEditMode();

        // ベトナム語ウインドウのスピーカーボタン
        document.getElementById('vietnameseSpeaker').addEventListener('click', () => {
            // 音声再生中の場合は停止
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
                return;
            }
            
            const vietnameseText = document.getElementById('vietnameseContent').textContent;
            if (vietnameseText && vietnameseText.trim() && vietnameseText !== 'Kết quả nhận dạng sẽ hiển thị ở đây') {
                this.stopListeningAndSpeak(vietnameseText);
            }
        });

        // 日本語コピーボタン
        document.getElementById('japaneseCopyBtn').addEventListener('click', () => {
            const japaneseText = document.getElementById('japaneseContent').textContent;
            if (japaneseText && japaneseText.trim()) {
                this.copyToClipboard(japaneseText);
            }
        });

        // ベトナム語コピーボタン  
        document.getElementById('vietnameseCopyBtn').addEventListener('click', () => {
            const vietnameseText = document.getElementById('vietnameseContent').textContent;
            if (vietnameseText && vietnameseText.trim()) {
                this.copyToClipboard(vietnameseText);
            }
        });
    }

    // マイクボタンのクリック処理
    handleMicClick() {
        if (this.isListening) {
            // 現在音声認識中の場合は停止
            this.stopListening();
        } else {
            // 音声認識開始（現在選択されている言語で）
            this.startLanguageListening(this.currentLanguage);
        }
    }

    // 言語を切り替える
    switchLanguage() {
        const wasListening = this.isListening;
        const oldLanguage = this.currentLanguage;
        const newLanguage = this.currentLanguage === 'ja' ? 'vi' : 'ja';
        
        // 音声認識中の場合は停止してから新しい言語で再開
        if (wasListening) {
            console.log(`言語切り替え: ${oldLanguage} -> ${newLanguage} (音声認識中)`);
            this.stopListening();
            
            // 少し待ってから新しい言語で認識開始
            setTimeout(() => {
                this.currentLanguage = newLanguage;
                this.updateLanguageIndicator();
                this.startLanguageListening(newLanguage);
            }, 200);
        } else {
            // 音声認識していない場合は単純に切り替え
            this.currentLanguage = newLanguage;
            this.updateLanguageIndicator();
        }
    }

    // 言語表示を更新
    updateLanguageIndicator() {
        const indicator = document.getElementById('languageIndicator');
        indicator.textContent = this.currentLanguage === 'ja' ? '日本語' : 'Tiếng Việt';
        
        // 言語切り替えボタンの見た目も更新
        const languageToggle = document.getElementById('languageToggle');
        languageToggle.className = `language-toggle-btn ${this.currentLanguage === 'ja' ? 'japanese' : 'vietnamese'}`;
    }

    toggleLanguageRecognition(language) {
        if (this.isListening && this.currentLanguage === language) {
            this.stopListening();
        } else {
            this.startLanguageListening(language);
        }
    }

    async startLanguageListening(language) {
        if (this.isListening) {
            this.stopListening();
        }

        if (!this.recognition) {
            console.error('音声認識が利用できません');
            alert('音声認識が利用できません。ブラウザを再読み込みしてください。');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            stream.getTracks().forEach(track => track.stop());
            console.log(`${language}音声認識のマイクアクセス許可確認完了`);
        } catch (error) {
            console.error('マイクアクセス許可エラー:', error);
            alert('マイクへのアクセス許可が必要です。ブラウザの設定を確認してください。');
            return;
        }

        this.currentLanguage = language;
        this.retryCount = 0;
        this.accumulatedText = '';

        // 言語設定
        if (language === 'ja') {
            this.recognition.lang = 'ja-JP';
        } else if (language === 'vi') {
            this.recognition.lang = 'vi-VN';
        }
        
        console.log(`音声認識言語設定: ${this.recognition.lang}, currentLanguage: ${this.currentLanguage}`);

        // ボタンの状態を更新
        this.updateMicButtonStates(language);
        this.updateLanguageIndicator();
        
        // ステータスを更新
        const statusElement = language === 'ja' 
            ? document.getElementById('japaneseStatus')
            : document.getElementById('vietnameseStatus');
        statusElement.textContent = language === 'ja' ? '準備中...' : 'Chuẩn bị...';
        statusElement.classList.add('listening');

        // コンテンツをクリア
        document.getElementById('japaneseContent').textContent = language === 'ja' 
            ? '' : '';
        document.getElementById('vietnameseContent').textContent = language === 'vi' 
            ? '' : '';

        this.isListening = true;
        
        setTimeout(() => {
            if (this.isListening) {
                this.startRecognitionSafely();
            }
        }, 500);
    }

    updateMicButtonStates(activeLanguage) {
        const micButton = document.getElementById('micButton');
        
        if (activeLanguage) {
            // 音声認識中の場合
            micButton.classList.add('active');
            this.updateWindowHighlight(activeLanguage);
            this.updateArrowDirection(activeLanguage);
        } else {
            // 音声認識停止時の場合
            micButton.classList.remove('active');
            this.updateLanguageIndicator(); // 現在の言語表示を更新
            this.updateWindowHighlight(null);
            this.updateArrowDirection(null);
        }
    }

    // ウィンドウのハイライト表示を更新
    updateWindowHighlight(activeLanguage) {
        const japaneseWindow = document.getElementById('japaneseWindow');
        const vietnameseWindow = document.getElementById('vietnameseWindow');
        
        // すべてのハイライトをクリア
        japaneseWindow.classList.remove('active');
        vietnameseWindow.classList.remove('active');
        
        // アクティブな言語のウィンドウをハイライト
        if (activeLanguage === 'ja') {
            japaneseWindow.classList.add('active');
        } else if (activeLanguage === 'vi') {
            vietnameseWindow.classList.add('active');
        }
    }

    // 矢印の向きを更新
    updateArrowDirection(activeLanguage) {
        const arrow = document.getElementById('translationArrow');
        
        if (activeLanguage === 'ja') {
            // 日本語認識中は下向き（日本語→ベトナム語）
            arrow.classList.remove('reverse');
        } else if (activeLanguage === 'vi') {
            // ベトナム語認識中は上向き（ベトナム語→日本語）
            arrow.classList.add('reverse');
        } else {
            // 認識停止時は下向きにリセット
            arrow.classList.remove('reverse');
        }
    }

    handleRecognitionFailure() {
        console.log('音声認識失敗処理');
        const errorMessage = this.currentLanguage === 'ja' 
            ? '音声認識に失敗しました。再度お試しください。' 
            : 'Nhận dạng giọng nói thất bại. Vui lòng thử lại.';
        
        const currentLangElement = this.currentLanguage === 'ja' 
            ? document.getElementById('japaneseStatus') 
            : document.getElementById('vietnameseStatus');
        
        currentLangElement.textContent = errorMessage;
        currentLangElement.style.color = '#ff6b6b';
        
        setTimeout(() => {
            this.stopListening();
        }, 2000);
    }

    startRecognitionSafely() {
        if (!this.recognition || this.isRecognitionActive || !this.isListening) {
            console.log('音声認識開始をスキップ: recognition unavailable or already active');
            return;
        }
        
        try {
            console.log(`音声認識開始: ${this.currentLanguage}, 言語: ${this.recognition.lang}`);
            this.recognition.start();
        } catch (error) {
            console.error('音声認識開始エラー:', error);
            if (error.message.includes('already started')) {
                console.log('既に開始済みのため続行');
                this.isRecognitionActive = true;
                return;
            }
            this.handleRecognitionFailure();
        }
    }

    stopListening() {
        console.log('stopListening呼び出し - 蓄積テキスト:', this.accumulatedText);
        this.isListening = false;
        this.retryCount = 0;
        
        // 蓄積されたテキストがあれば最終翻訳と履歴保存を実行
        if (this.accumulatedText && this.accumulatedText.trim() !== '') {
            console.log('最終翻訳・履歴保存実行:', this.accumulatedText);
            this.finalTranslateAndSave(this.accumulatedText, this.detectedLanguage);
            this.accumulatedText = '';
        }
        
        if (this.recognitionTimeout) {
            clearTimeout(this.recognitionTimeout);
            this.recognitionTimeout = null;
        }
        
        if (this.recognition && this.isRecognitionActive) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('音声認識停止エラー:', error);
            }
        }
        
        this.isRecognitionActive = false;

        this.updateMicButtonStates(null);
        document.getElementById('japaneseStatus').textContent = '待機中';
        document.getElementById('vietnameseStatus').textContent = 'Chờ';
        document.getElementById('japaneseStatus').style.color = '';
        document.getElementById('vietnameseStatus').style.color = '';
    }

    async finalTranslateAndSave(text, detectedLang) {
        if (!text || text.trim() === '') return;
        
        try {
            const translatedText = await this.translateText(text, detectedLang);
            const targetLanguage = detectedLang === 'ja' ? 'vi' : 'ja';
            
            // 翻訳結果を表示
            this.updateContent(targetLanguage, translatedText);
            
            // 履歴に保存
            this.addToHistory({
                timestamp: new Date(),
                originalLanguage: detectedLang,
                originalText: text,
                translatedText: translatedText,
                targetLanguage: targetLanguage
            });
            
            console.log('履歴に保存完了:', text);
            
        } catch (error) {
            console.error('最終翻訳エラー:', error);
            const errorMessage = detectedLang === 'ja' ? '翻訳に失敗しました' : 'Dịch thất bại';
            const targetLanguage = detectedLang === 'ja' ? 'vi' : 'ja';
            this.updateContent(targetLanguage, errorMessage);
        }
    }

    updateStatus() {
        if (!this.isListening) {
            document.getElementById('japaneseStatus').textContent = '待機中';
            document.getElementById('vietnameseStatus').textContent = 'Chờ';
        }
    }

    updateContent(language, text, isInterim = false) {
        const contentElement = language === 'ja' 
            ? document.getElementById('japaneseContent')
            : document.getElementById('vietnameseContent');
        
        contentElement.textContent = text;
        
        if (isInterim) {
            contentElement.style.opacity = '0.7';
        } else {
            contentElement.style.opacity = '1';
            
            // 日本語の場合はコピーボタンを表示/非表示
            if (language === 'ja') {
                const copyBtn = document.getElementById('japaneseCopyBtn');
                if (text && text.trim()) {
                    copyBtn.style.display = 'flex';
                } else {
                    copyBtn.style.display = 'none';
                }
            }
            
            // ベトナム語の場合はスピーカーボタンとコピーボタンを表示/非表示
            if (language === 'vi') {
                const speakerBtn = document.getElementById('vietnameseSpeaker');
                const copyBtn = document.getElementById('vietnameseCopyBtn');
                if (text && text.trim() && text !== 'Kết quả nhận dạng sẽ hiển thị ở đây') {
                    speakerBtn.style.display = 'flex';
                    copyBtn.style.display = 'flex';
                } else {
                    speakerBtn.style.display = 'none';
                    copyBtn.style.display = 'none';
                }
            }
        }
    }

    async handleSpeechResult(text) {
        console.log('認識結果:', text);
        
        // accumulatedTextに追加
        if (this.accumulatedText) {
            this.accumulatedText += ' ' + text.trim();
        } else {
            this.accumulatedText = text.trim();
        }
        console.log('蓄積テキスト更新:', this.accumulatedText);
        
        // 現在選択されている言語を使用
        this.detectedLanguage = this.currentLanguage;
        console.log('使用言語:', this.detectedLanguage);
        
        // テキストを表示
        this.updateContent(this.detectedLanguage, this.accumulatedText);
        this.updateDetectedLanguageStatus(this.detectedLanguage);

        try {
            const translatedText = await this.translateText(this.accumulatedText, this.detectedLanguage);
            const targetLanguage = this.detectedLanguage === 'ja' ? 'vi' : 'ja';
            
            this.updateContent(targetLanguage, translatedText);
            
            console.log('翻訳完了、履歴保存は待機中');

        } catch (error) {
            console.error('翻訳エラー:', error);
            const errorMessage = this.detectedLanguage === 'ja' 
                ? '翻訳に失敗しました' 
                : 'Dịch thất bại';
            
            const targetLanguage = this.detectedLanguage === 'ja' ? 'vi' : 'ja';
            this.updateContent(targetLanguage, errorMessage);
        }
    }

    updateDetectedLanguageStatus(detectedLang) {
        if (detectedLang === 'ja') {
            document.getElementById('japaneseStatus').textContent = '認識中: 日本語';
            document.getElementById('vietnameseStatus').textContent = 'Chờ';
            document.getElementById('japaneseStatus').style.color = '#4CAF50';
            document.getElementById('vietnameseStatus').style.color = '';
        } else {
            document.getElementById('vietnameseStatus').textContent = 'Đang nhận dạng: Tiếng Việt';
            document.getElementById('japaneseStatus').textContent = '待機中';
            document.getElementById('vietnameseStatus').style.color = '#4CAF50';
            document.getElementById('japaneseStatus').style.color = '';
        }
    }

    async translateText(text, sourceLanguage) {
        const targetLanguage = sourceLanguage === 'ja' ? 'vi' : 'ja';
        
        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    source: sourceLanguage,
                    target: targetLanguage
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.translatedText;
        } catch (error) {
            console.error('翻訳API呼び出しエラー:', error);
            
            return await this.fallbackTranslate(text, sourceLanguage, targetLanguage);
        }
    }

    async fallbackTranslate(text, sourceLanguage, targetLanguage) {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data && data[0] && data[0][0] && data[0][0][0]) {
                return data[0][0][0];
            }
            
            throw new Error('翻訳データの形式が不正です');
        } catch (error) {
            console.error('フォールバック翻訳エラー:', error);
            return sourceLanguage === 'ja' ? '[翻訳失敗]' : '[Dịch thất bại]';
        }
    }

    addToHistory(entry) {
        this.history.unshift(entry);
        
        if (this.history.length > 100) {
            this.history = this.history.slice(0, 100);
        }
        
        this.saveHistory();
    }

    saveHistory() {
        localStorage.setItem('translationHistory', JSON.stringify(this.history));
    }

    loadHistory() {
        this.history = JSON.parse(localStorage.getItem('translationHistory') || '[]');
    }

    showHistory() {
        const modal = document.getElementById('historyModal');
        const historyList = document.getElementById('historyList');
        
        if (this.history.length === 0) {
            historyList.innerHTML = '<p style="text-align: center; color: #999;">履歴がありません</p>';
        } else {
            historyList.innerHTML = this.history.map((entry, index) => {
                const date = new Date(entry.timestamp);
                const isVietnamese = entry.originalLanguage === 'vi';
                
                // ベトナム語のテキストを確認
                const vietnameseText = isVietnamese ? entry.originalText : entry.translatedText;
                const hasVietnamese = vietnameseText && vietnameseText.trim() !== '';
                
                return `
                    <div class="history-item ${isVietnamese ? 'vietnamese' : ''}" data-index="${index}" onclick="voiceTranslator.toggleHistoryHighlight(${index})">
                        <div class="history-timestamp">${date.toLocaleString('ja-JP')}</div>
                        <div class="history-text">
                            ${entry.originalText}
                            ${isVietnamese && hasVietnamese ? `<button class="speaker-btn" onclick="event.stopPropagation(); voiceTranslator.handleSpeakerClick('${vietnameseText.replace(/'/g, "\\'")}')" title="ベトナム語で読み上げ">🔊</button>` : ''}
                        </div>
                        <div class="history-translation">
                            ${entry.translatedText}
                            ${!isVietnamese && hasVietnamese ? `<button class="speaker-btn" onclick="event.stopPropagation(); voiceTranslator.handleSpeakerClick('${vietnameseText.replace(/'/g, "\\'")}')" title="ベトナム語で読み上げ">🔊</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        modal.classList.remove('hidden');
    }

    hideHistory() {
        document.getElementById('historyModal').classList.add('hidden');
    }

    toggleHistoryHighlight(index) {
        const historyItem = document.querySelector(`[data-index="${index}"]`);
        if (historyItem) {
            historyItem.classList.toggle('highlighted');
        }
    }

    clearHistory() {
        if (confirm('履歴をすべて削除しますか？')) {
            this.history = [];
            this.saveHistory();
            this.hideHistory();
        }
    }

    // スピーカーボタンのクリック処理（停止機能付き）
    handleSpeakerClick(text) {
        // 音声再生中の場合は停止
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
            return;
        }
        
        // 音声再生開始
        this.stopListeningAndSpeak(text);
    }

    // 文字出力ウィンドウのダブルタップ編集モード設定
    setupDoubleTabEditMode() {
        const japaneseContent = document.getElementById('japaneseContent');
        const vietnameseContent = document.getElementById('vietnameseContent');
        
        // 各コンテンツエリアにダブルタップ機能を追加
        this.addDoubleTabEdit(japaneseContent);
        this.addDoubleTabEdit(vietnameseContent);
    }

    // ダブルタップ編集機能をコンテンツエリアに追加
    addDoubleTabEdit(element) {
        let lastTap = 0;
        let isEditing = false;
        
        element.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            
            if (tapLength < 300 && tapLength > 0) {
                // ダブルタップ検出
                e.preventDefault();
                if (!isEditing && this.isRecognitionActive) {  // 認識中のみ編集可能
                    this.enterEditMode(element);
                    isEditing = true;
                }
            }
            lastTap = currentTime;
        });

        // デスクトップ用ダブルクリック
        element.addEventListener('dblclick', () => {
            if (!isEditing && this.isRecognitionActive) {  // 認識中のみ編集可能
                this.enterEditMode(element);
                isEditing = true;
            }
        });
    }

    // 編集モードに入る
    enterEditMode(element) {
        const currentText = element.textContent || '';
        
        // テキストエリアを作成
        const textarea = document.createElement('textarea');
        textarea.value = currentText;
        textarea.className = 'edit-textarea';
        textarea.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            outline: none;
            resize: none;
            font-size: 1.1rem;
            line-height: 1.6;
            padding: 20px;
            background: rgba(255, 255, 255, 0.9);
            font-family: inherit;
            border: 2px solid #4CAF50;
            border-radius: 8px;
        `;
        
        // 元のコンテンツを隠して、テキストエリアを表示
        element.style.display = 'none';
        element.parentNode.insertBefore(textarea, element.nextSibling);
        textarea.focus();
        textarea.select();
        
        // 編集完了処理
        const finishEdit = async () => {
            const newText = textarea.value.trim();
            element.textContent = newText;
            element.style.display = 'flex';
            textarea.remove();
            
            // 編集されたテキストで再翻訳を実行
            if (newText && this.isRecognitionActive) {
                await this.retranslateEditedText(element, newText);
            }
        };
        
        // Enterキー（Shift+Enterは改行）またはフォーカス外れで編集完了
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishEdit();
            }
        });
        
        textarea.addEventListener('blur', finishEdit);
    }

    // 編集されたテキストで再翻訳を実行
    async retranslateEditedText(editedElement, newText) {
        try {
            // 編集された要素が日本語かベトナム語かを判定
            const isJapanese = editedElement.id === 'japaneseContent';
            const sourceLanguage = isJapanese ? 'ja' : 'vi';
            const targetLanguage = isJapanese ? 'vi' : 'ja';
            
            // 翻訳を実行
            const translatedText = await this.translateText(newText, sourceLanguage);
            
            // 翻訳結果を対象言語のウィンドウに表示
            this.updateContent(targetLanguage, translatedText);
            
            console.log('編集後再翻訳完了:', newText, '->', translatedText);
            
        } catch (error) {
            console.error('編集後再翻訳エラー:', error);
            const errorMessage = sourceLanguage === 'ja' ? '翻訳に失敗しました' : 'Dịch thất bại';
            const targetLanguage = sourceLanguage === 'ja' ? 'vi' : 'ja';
            this.updateContent(targetLanguage, errorMessage);
        }
    }

    // マイクを停止してからスピーカーを再生
    stopListeningAndSpeak(text) {
        // マイクが動作中なら停止して状態を記録
        this.wasListeningBeforeSpeaking = this.isListening;
        if (this.isListening) {
            this.stopListening();
        }
        
        // ベトナム語音声を再生（コールバック付き）
        this.speakVietnamese(text, () => {
            // 音声再生完了後、元々マイクがオンだった場合は再開
            if (this.wasListeningBeforeSpeaking) {
                setTimeout(() => {
                    this.startLanguageListening(this.currentLanguage);
                    this.wasListeningBeforeSpeaking = false;
                }, 500); // 0.5秒後に再開
            }
        });
    }

    // ベトナム語音声読み上げ機能
    speakVietnamese(text, onEndCallback = null) {
        if (!text || text.trim() === '') {
            console.log('テキストが空です');
            if (onEndCallback) onEndCallback();
            return;
        }

        // Web Speech API のサポート確認
        if (!('speechSynthesis' in window)) {
            alert('お使いのブラウザは音声合成をサポートしていません。');
            if (onEndCallback) onEndCallback();
            return;
        }

        // 現在の音声を停止
        speechSynthesis.cancel();

        // 音声の読み込み処理
        const speakWithVoice = () => {
            // 音声合成の準備
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN'; // ベトナム語
            utterance.rate = 0.8; // 速度をやや遅く
            utterance.pitch = 1.0; // ピッチ
            utterance.volume = 1.0; // 音量

            // ベトナム語の音声を探す
            const voices = speechSynthesis.getVoices();
            const vietnameseVoice = voices.find(voice => 
                voice.lang.includes('vi') || voice.lang.includes('VN') || 
                voice.name.toLowerCase().includes('vietnamese')
            );
            
            if (vietnameseVoice) {
                utterance.voice = vietnameseVoice;
                console.log('ベトナム語音声を使用:', vietnameseVoice.name);
            } else {
                console.log('ベトナム語の音声が見つかりません。デフォルトの音声を使用します。');
                // 利用可能な音声をログに出力
                console.log('利用可能な音声:', voices.map(v => v.lang + ' - ' + v.name));
            }

            // エラーハンドリング
            utterance.onerror = (event) => {
                console.error('音声合成エラー:', event);
                alert('音声の再生に失敗しました。ブラウザがベトナム語の音声合成をサポートしていない可能性があります。');
                if (onEndCallback) onEndCallback();
            };

            utterance.onstart = () => {
                console.log('ベトナム語音声開始:', text);
            };

            utterance.onend = () => {
                console.log('ベトナム語音声終了');
                // 音声再生完了後にコールバック実行
                if (onEndCallback) {
                    onEndCallback();
                }
            };

            // 音声を再生
            speechSynthesis.speak(utterance);
        };

        // 音声が読み込まれていない場合の対処
        const voices = speechSynthesis.getVoices();
        if (voices.length === 0) {
            // 音声の読み込みを待つ
            speechSynthesis.onvoiceschanged = () => {
                speakWithVoice();
                speechSynthesis.onvoiceschanged = null; // イベントリスナーを削除
            };
        } else {
            speakWithVoice();
        }
    }

    // クリップボードにテキストをコピーする関数
    async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                // Clipboard APIを使用（HTTPS環境）
                await navigator.clipboard.writeText(text);
                console.log('クリップボードにコピーしました:', text);
                this.showCopyFeedback();
            } else {
                // フォールバック（HTTP環境）
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                console.log('クリップボードにコピーしました (fallback):', text);
                this.showCopyFeedback();
            }
        } catch (error) {
            console.error('クリップボードコピーエラー:', error);
            alert('クリップボードへのコピーに失敗しました');
        }
    }

    // コピー完了のフィードバックを表示
    showCopyFeedback() {
        // 簡単な視覚フィードバック
        const feedback = document.createElement('div');
        feedback.textContent = 'コピーしました';
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #4CAF50;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-size: 1rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(feedback);
        
        // 1.5秒後にフィードバックを削除
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 1500);
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('Service Worker registered: ', registration);
            })
            .catch(registrationError => {
                console.log('Service Worker registration failed: ', registrationError);
            });
    });
}

// グローバル変数としてvoiceTranslatorを宣言
let voiceTranslator;

document.addEventListener('DOMContentLoaded', () => {
    voiceTranslator = new VoiceTranslator();
});