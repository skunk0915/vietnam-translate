class VoiceTranslator {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.isRecognitionActive = false;
        this.currentLanguage = null;
        this.detectedLanguage = null;
        this.history = JSON.parse(localStorage.getItem('translationHistory') || '[]');
        this.continuousText = '';
        this.silenceTimer = null;
        this.silenceDelay = 1500; // 1.5秒間無音の場合に翻訳実行
        this.currentLangIndex = 0; // 現在の言語インデックス
        this.languages = ['ja-JP', 'vi-VN']; // 交互に試行する言語
        this.isLanguageSwitching = false;
        this.accumulatedText = ''; // マイクオフまで蓄積するテキスト
        this.displayedSourceText = ''; // 現在表示中の音声認識テキスト
        this.currentDisplayedLang = null; // 現在表示中の言語
        
        this.init();
    }

    init() {
        this.setupSpeechRecognition();
        this.setupEventListeners();
        this.loadHistory();
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
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognitionTimeout = null;
        this.retryCount = 0;
        this.maxRetries = 3;

        this.recognition.onstart = () => {
            console.log('音声認識開始');
            this.isRecognitionActive = true;
            if (this.currentLanguage === 'auto') {
                document.getElementById('autoStatus').textContent = '聞いています...';
            } else if (this.currentLanguage === 'ja') {
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

            if (this.currentLanguage === 'auto') {
                // 自動認識モードでは連続テキストとして蓄積
                if (finalTranscript) {
                    // 最終結果を蓄積テキストに追加
                    if (this.accumulatedText) {
                        this.accumulatedText += ' ' + finalTranscript.trim();
                    } else {
                        this.accumulatedText = finalTranscript.trim();
                    }
                    console.log('蓄積テキスト更新:', this.accumulatedText);
                    
                    // 言語を検出して表示
                    const detectedLang = this.detectLanguage(this.accumulatedText);
                    this.displayContinuousText(this.accumulatedText, detectedLang, true);
                    
                    // 無音タイマーをリセット
                    this.resetSilenceTimer();
                    
                } else if (interimTranscript) {
                    // 暫定結果を表示（蓄積はしない）
                    const tempText = this.accumulatedText ? this.accumulatedText + ' ' + interimTranscript : interimTranscript;
                    const detectedLang = this.detectLanguage(tempText);
                    this.displayContinuousText(tempText, detectedLang, false);
                }
            } else {
                // 個別言語認識モードでは従来の動作
                if (finalTranscript) {
                    this.handleSpeechResult(finalTranscript.trim());
                } else if (interimTranscript) {
                    this.updateContent(this.currentLanguage, interimTranscript, true);
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.error('音声認識エラー:', event.error);
            this.isRecognitionActive = false;
            let errorMessage = '';
            let shouldRetry = false;
            let shouldSwitchLanguage = false;
            
            switch(event.error) {
                case 'network':
                    errorMessage = 'ネットワークエラーです。音声認識を停止します。';
                    break;
                case 'not-allowed':
                    errorMessage = 'マイクのアクセス許可が必要です。';
                    break;
                case 'no-speech':
                    if (this.currentLanguage === 'auto' && !this.isLanguageSwitching) {
                        // 自動認識モードでno-speechエラーの場合、言語を切り替えて再試行
                        shouldSwitchLanguage = true;
                        errorMessage = `言語切り替え中... (${this.recognition.lang} → ${this.getNextLanguage()})`;
                    } else if (this.retryCount < this.maxRetries) {
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
            
            const currentLangElement = this.currentLanguage === 'auto'
                ? document.getElementById('autoStatus')
                : this.currentLanguage === 'ja' 
                    ? document.getElementById('japaneseStatus') 
                    : document.getElementById('vietnameseStatus');
            currentLangElement.textContent = errorMessage;
            currentLangElement.style.color = '#ff6b6b';
            
            if (shouldSwitchLanguage && this.isListening) {
                setTimeout(() => {
                    this.switchRecognitionLanguage();
                }, 1000);
            } else if (shouldRetry && this.retryCount < this.maxRetries && this.isListening) {
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
        document.getElementById('autoMic').addEventListener('click', () => {
            this.toggleAutoRecognition();
        });

        document.getElementById('japaneseMic').addEventListener('click', () => {
            this.toggleLanguageRecognition('ja');
        });

        document.getElementById('vietnameseMic').addEventListener('click', () => {
            this.toggleLanguageRecognition('vi');
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

        // ベトナム語ウインドウのスピーカーボタン
        document.getElementById('vietnameseSpeaker').addEventListener('click', () => {
            const vietnameseText = document.getElementById('vietnameseContent').textContent;
            if (vietnameseText && vietnameseText.trim() && vietnameseText !== 'Kết quả nhận dạng sẽ hiển thị ở đây') {
                this.speakVietnamese(vietnameseText);
            }
        });
    }

    toggleAutoRecognition() {
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startAutoListening();
        }
    }

    toggleLanguageRecognition(language) {
        if (this.isListening && this.currentLanguage === language) {
            this.stopListening();
        } else {
            this.startLanguageListening(language);
        }
    }

    async startAutoListening() {
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
            console.log('マイクアクセス許可確認完了');
        } catch (error) {
            console.error('マイクアクセス許可エラー:', error);
            alert('マイクへのアクセス許可が必要です。ブラウザの設定を確認してください。');
            return;
        }

        this.currentLanguage = 'auto';
        this.retryCount = 0;
        this.continuousText = ''; // 連続テキストを初期化
        // this.accumulatedText = ''; // 蓄積テキストを初期化 - マイクオフまで保持
        this.currentLangIndex = 0; // 言語インデックスをリセット

        // 自動認識では連続認識を有効化
        this.recognition.continuous = true;

        // 最初は日本語から開始
        this.recognition.lang = this.languages[this.currentLangIndex];
        console.log('音声認識言語設定:', this.recognition.lang);
        
        this.updateMicButtonStates('auto');
        document.getElementById('autoStatus').textContent = '準備中...';
        document.getElementById('autoStatus').classList.add('listening');
        // 既存のテキストをクリアせず、継続して音声認識を行う
        // document.getElementById('japaneseContent').textContent = '音声認識開始';
        // document.getElementById('vietnameseContent').textContent = 'Bắt đầu nhận dạng giọng nói';

        this.isListening = true;
        
        setTimeout(() => {
            if (this.isListening) {
                this.startRecognitionSafely();
            }
        }, 500);
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

        // 言語固有認識では連続認識を無効化
        this.recognition.continuous = false;

        // 言語設定
        if (language === 'ja') {
            this.recognition.lang = 'ja-JP';
        } else if (language === 'vi') {
            this.recognition.lang = 'vi-VN';
        }

        // ボタンの状態を更新
        this.updateMicButtonStates(language);
        
        // ステータスを更新
        const statusElement = language === 'ja' 
            ? document.getElementById('japaneseStatus')
            : document.getElementById('vietnameseStatus');
        statusElement.textContent = language === 'ja' ? '準備中...' : 'Chuẩn bị...';
        statusElement.classList.add('listening');

        // コンテンツをクリア
        document.getElementById('japaneseContent').textContent = language === 'ja' 
            ? '' : '認識結果がここに表示されます';
        document.getElementById('vietnameseContent').textContent = language === 'vi' 
            ? '' : 'Kết quả nhận dạng sẽ hiển thị ở đây';

        this.isListening = true;
        
        setTimeout(() => {
            if (this.isListening) {
                this.startRecognitionSafely();
            }
        }, 500);
    }

    updateMicButtonStates(activeLanguage) {
        // すべてのマイクボタンを非アクティブ状態にリセット
        document.getElementById('autoMic').classList.remove('active');
        document.getElementById('japaneseMic').classList.remove('active');
        document.getElementById('vietnameseMic').classList.remove('active');

        // アクティブな言語のボタンのみアクティブ状態に
        if (activeLanguage === 'auto') {
            document.getElementById('autoMic').classList.add('active');
        } else if (activeLanguage === 'ja') {
            document.getElementById('japaneseMic').classList.add('active');
        } else if (activeLanguage === 'vi') {
            document.getElementById('vietnameseMic').classList.add('active');
        }
        // null の場合はすべて非アクティブのまま（既にリセット済み）
    }

    handleRecognitionFailure() {
        console.log('音声認識失敗処理');
        const errorMessage = this.currentLanguage === 'ja' 
            ? '音声認識に失敗しました。再度お試しください。' 
            : 'Nhận dạng giọng nói thất bại. Vui lòng thử lại.';
        
        const currentLangElement = this.currentLanguage === 'auto'
            ? document.getElementById('autoStatus')
            : this.currentLanguage === 'ja' 
                ? document.getElementById('japaneseStatus') 
                : document.getElementById('vietnameseStatus');
        
        currentLangElement.textContent = errorMessage;
        currentLangElement.style.color = '#ff6b6b';
        
        setTimeout(() => {
            this.stopListening();
        }, 2000);
    }

    getNextLanguage() {
        const nextIndex = (this.currentLangIndex + 1) % this.languages.length;
        return this.languages[nextIndex];
    }

    switchRecognitionLanguage() {
        console.log('言語切り替え実行');
        this.isLanguageSwitching = true;
        
        // 次の言語に切り替え
        this.currentLangIndex = (this.currentLangIndex + 1) % this.languages.length;
        this.recognition.lang = this.languages[this.currentLangIndex];
        
        console.log('音声認識言語変更:', this.recognition.lang);
        
        // ステータス更新
        document.getElementById('autoStatus').textContent = `言語変更: ${this.recognition.lang}`;
        document.getElementById('autoStatus').style.color = '#4CAF50';
        
        setTimeout(() => {
            this.isLanguageSwitching = false;
            if (this.isListening) {
                this.startRecognitionSafely();
            }
        }, 1000);
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
        
        // 無音タイマーをクリア
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        
        // 蓄積されたテキストがあれば最終翻訳と履歴保存を実行
        if (this.accumulatedText && this.accumulatedText.trim() !== '') {
            console.log('最終翻訳・履歴保存実行:', this.accumulatedText);
            const finalDetectedLang = this.detectLanguage(this.accumulatedText);
            this.finalTranslateAndSave(this.accumulatedText, finalDetectedLang);
            this.accumulatedText = ''; // マイクオフ後にクリア
        }
        
        // 表示状態をクリア
        this.displayedSourceText = '';
        this.currentDisplayedLang = null;
        
        // 古い連続テキストもクリア
        this.continuousText = '';
        
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
        document.getElementById('autoStatus').textContent = '待機中';
        document.getElementById('autoStatus').classList.remove('listening');
        document.getElementById('autoStatus').style.color = '';
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
            
            // 履歴に保存（マイクオフ時に1回だけ）
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
            document.getElementById('autoStatus').textContent = '待機中';
            document.getElementById('japaneseStatus').textContent = '待機中';
            document.getElementById('vietnameseStatus').textContent = 'Chờ';
        }
    }

    updateContent(language, text, isInterim = false) {
        const contentElement = language === 'ja' 
            ? document.getElementById('japaneseContent')
            : document.getElementById('vietnameseContent');
        
        // 音声認識中の場合、音声認識テキストと同じ言語への更新を禁止
        if (!this.isListening || this.currentDisplayedLang !== language) {
            contentElement.textContent = text;
        } else {
            console.log('音声認識中のため、音声認識テキストの上書きを防止:', language, text.substring(0, 30) + '...');
        }
        
        if (isInterim) {
            contentElement.style.opacity = '0.7';
        } else {
            contentElement.style.opacity = '1';
            
            // ベトナム語の場合はスピーカーボタンを表示/非表示
            if (language === 'vi') {
                const speakerBtn = document.getElementById('vietnameseSpeaker');
                if (text && text.trim() && text !== 'Kết quả nhận dạng sẽ hiển thị ở đây') {
                    speakerBtn.style.display = 'flex';
                } else {
                    speakerBtn.style.display = 'none';
                }
            }
        }
    }

    displayContinuousText(text, detectedLang, isFinal = false) {
        if (!text || text.trim() === '') return;
        
        // 検出された言語のウインドウにテキストを表示（既存のテキストを維持）
        const contentElement = detectedLang === 'ja' 
            ? document.getElementById('japaneseContent')
            : document.getElementById('vietnameseContent');
        
        // 相手言語のウインドウは翻訳時のみ更新
        const otherContentElement = detectedLang === 'ja' 
            ? document.getElementById('vietnameseContent')
            : document.getElementById('japaneseContent');
        
        // 現在の音声認識テキスト状態を更新
        this.displayedSourceText = text;
        this.currentDisplayedLang = detectedLang;
        
        // 既存のテキストをクリアせず、新しいテキストを設定
        contentElement.textContent = text;
        contentElement.style.opacity = isFinal ? '1' : '0.7';
        
        // 相手言語のウインドウには翻訳待機メッセージを表示
        if (!isFinal) {
            // 既存のテキストがある場合は保持、なければ翻訳待機メッセージ
            const existingText = otherContentElement.textContent;
            if (!existingText || existingText === 'Kết quả nhận dạng sẽ hiển thị ở đây' || existingText === '認識結果がここに表示されます') {
                otherContentElement.textContent = detectedLang === 'ja' ? 'Đang chờ dịch...' : '翻訳待機中...';
            }
        }
        
        // ベトナム語の場合はスピーカーボタンを表示
        if (detectedLang === 'vi' && isFinal) {
            const speakerBtn = document.getElementById('vietnameseSpeaker');
            speakerBtn.style.display = 'flex';
        }
        
        // 状態を更新
        this.updateDetectedLanguageStatus(detectedLang);
    }

    resetSilenceTimer() {
        // 無音タイマーをリセット
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        
        // 新しい無音タイマーを設定（翻訳のみ実行、履歴保存は無し）
        this.silenceTimer = setTimeout(() => {
            if (this.accumulatedText && this.isListening) {
                console.log('無音タイマー実行: 翻訳のみ（履歴保存は無し）');
                const detectedLang = this.detectLanguage(this.accumulatedText);
                this.translateTextOnly(this.accumulatedText, detectedLang);
            }
        }, this.silenceDelay);
    }

    async translateTextOnly(text, detectedLang) {
        if (!text || text.trim() === '') return;
        
        try {
            const translatedText = await this.translateText(text, detectedLang);
            const targetLanguage = detectedLang === 'ja' ? 'vi' : 'ja';
            
            // 翻訳結果を表示（履歴保存は無し）
            this.updateContent(targetLanguage, translatedText);
            
            console.log('リアルタイム翻訳完了（履歴保存は無し）');
            
        } catch (error) {
            console.error('リアルタイム翻訳エラー:', error);
            const errorMessage = detectedLang === 'ja' ? '翻訳に失敗しました' : 'Dịch thất bại';
            const targetLanguage = detectedLang === 'ja' ? 'vi' : 'ja';
            this.updateContent(targetLanguage, errorMessage);
        }
    }

    async translateAndSaveText(text, detectedLang) {
        if (!text || text.trim() === '') return;
        
        try {
            const translatedText = await this.translateText(text, detectedLang);
            const targetLanguage = detectedLang === 'ja' ? 'vi' : 'ja';
            
            // 翻訳結果を表示
            this.updateContent(targetLanguage, translatedText);
            
            // 履歴には保存しない（マイクオフ時まで待つ）
            console.log('翻訳完了、履歴保存は待機中');
            
        } catch (error) {
            console.error('翻訳エラー:', error);
            const errorMessage = detectedLang === 'ja' ? '翻訳に失敗しました' : 'Dịch thất bại';
            const targetLanguage = detectedLang === 'ja' ? 'vi' : 'ja';
            this.updateContent(targetLanguage, errorMessage);
        }
    }

    async translateContinuousText(text, sourceLanguage) {
        if (!text || text.trim() === '') return;
        
        try {
            const translatedText = await this.translateText(text, sourceLanguage);
            const targetLanguage = sourceLanguage === 'ja' ? 'vi' : 'ja';
            
            this.updateContent(targetLanguage, translatedText);
            
            // 履歴に追加
            this.addToHistory({
                timestamp: new Date(),
                originalLanguage: sourceLanguage,
                originalText: text,
                translatedText: translatedText,
                targetLanguage: targetLanguage
            });

        } catch (error) {
            console.error('連続翻訳エラー:', error);
            const errorMessage = sourceLanguage === 'ja' 
                ? '翻訳に失敗しました' 
                : 'Dịch thất bại';
            
            const targetLanguage = sourceLanguage === 'ja' ? 'vi' : 'ja';
            this.updateContent(targetLanguage, errorMessage);
        }
    }

    detectLanguage(text) {
        // より正確なベトナム語文字パターン
        const vietnamesePattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/;
        // 日本語の文字パターン（ひらがな、カタカナ、漢字）
        const hiraganaPattern = /[あ-ん]/;
        const katakanaPattern = /[ア-ン]/;
        const kanjiPattern = /[一-龯]/;
        
        // 明確にベトナム語の特殊文字が含まれている場合
        if (vietnamesePattern.test(text)) {
            return 'vi';
        }
        
        // 明確に日本語の文字が含まれている場合
        if (hiraganaPattern.test(text) || katakanaPattern.test(text)) {
            return 'ja';
        }
        
        // 漢字のみの場合は、より詳細な分析
        if (kanjiPattern.test(text)) {
            // ベトナム語でよく使われる漢字（Chữ Nôm）と日本語の文脈で判断
            const vietnameseKanjiWords = ['越南', '河内', '胡志明', '大南', '北圻', '中圻', '南圻'];
            const japaneseKanjiWords = ['日本', '東京', '大阪', '京都', '神戸', '横浜', '福岡'];
            
            for (const word of vietnameseKanjiWords) {
                if (text.includes(word)) {
                    return 'vi';
                }
            }
            
            for (const word of japaneseKanjiWords) {
                if (text.includes(word)) {
                    return 'ja';
                }
            }
        }
        
        // 一般的な単語・フレーズによる判定（強化版）
        const commonJapanese = [
            'こんにちは', 'ありがとう', 'すみません', 'はい', 'いいえ', 'です', 'ます', 
            'おはよう', 'こんばんは', 'さようなら', 'どうも', 'もしもし', 'お疲れ様',
            'よろしく', 'ください', 'どこ', 'なに', 'いつ', 'だれ', 'どうして', 'なぜ'
        ];
        
        const commonVietnamese = [
            'xin chào', 'cảm ơn', 'xin lỗi', 'vâng', 'không', 'tôi', 'bạn', 'chúng ta', 'làm',
            'chào bạn', 'cảm ơn bạn', 'xin chào anh', 'xin chào chị', 'anh ơi', 'chị ơi',
            'ở đâu', 'gì vậy', 'khi nào', 'ai vậy', 'tại sao', 'vì sao', 'làm gì'
        ];
        
        const textLower = text.toLowerCase();
        
        // 日本語の判定
        let japaneseScore = 0;
        for (const word of commonJapanese) {
            if (textLower.includes(word)) {
                japaneseScore += word.length;
            }
        }
        
        // ベトナム語の判定
        let vietnameseScore = 0;
        for (const word of commonVietnamese) {
            if (textLower.includes(word)) {
                vietnameseScore += word.length;
            }
        }
        
        // スコアによる判定
        if (vietnameseScore > japaneseScore && vietnameseScore > 0) {
            return 'vi';
        } else if (japaneseScore > vietnameseScore && japaneseScore > 0) {
            return 'ja';
        }
        
        // 音韻的特徴による判定
        const vietnamesePhonetic = /ng|nh|ph|th|tr|gi|qu/gi;
        const vietnameseMatches = (text.match(vietnamesePhonetic) || []).length;
        
        const japanesePhonetic = /(ん|っ|ゃ|ゅ|ょ|ー)/g;
        const japaneseMatches = (text.match(japanesePhonetic) || []).length;
        
        if (vietnameseMatches > japaneseMatches && vietnameseMatches > 2) {
            return 'vi';
        } else if (japaneseMatches > vietnameseMatches && japaneseMatches > 1) {
            return 'ja';
        }
        
        // デフォルトは日本語（元の動作を維持）
        return 'ja';
    }

    async handleSpeechResult(text) {
        console.log('認識結果:', text);
        
        // accumulatedTextに追加（個別音声認識でも連続性を保持）
        if (this.accumulatedText) {
            this.accumulatedText += ' ' + text.trim();
        } else {
            this.accumulatedText = text.trim();
        }
        console.log('蓄積テキスト更新 (個別モード):', this.accumulatedText);
        
        this.detectedLanguage = this.detectLanguage(this.accumulatedText);
        console.log('検出言語:', this.detectedLanguage);
        
        // 蓄積テキスト全体を表示
        this.displayContinuousText(this.accumulatedText, this.detectedLanguage, true);
        this.updateDetectedLanguageStatus(this.detectedLanguage);

        try {
            const translatedText = await this.translateText(this.accumulatedText, this.detectedLanguage);
            const targetLanguage = this.detectedLanguage === 'ja' ? 'vi' : 'ja';
            
            this.updateContent(targetLanguage, translatedText);
            
            // 個別音声認識では履歴保存しない（マイクオフ時まで待つ）
            console.log('個別音声認識: 翻訳完了、履歴保存は待機中');

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
            document.getElementById('japaneseStatus').textContent = '検出: 日本語';
            document.getElementById('vietnameseStatus').textContent = 'Chờ';
            document.getElementById('japaneseStatus').style.color = '#4CAF50';
            document.getElementById('vietnameseStatus').style.color = '';
        } else {
            document.getElementById('vietnameseStatus').textContent = 'Phát hiện: Tiếng Việt';
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
                            ${isVietnamese && hasVietnamese ? `<button class="speaker-btn" onclick="event.stopPropagation(); voiceTranslator.speakVietnamese('${vietnameseText.replace(/'/g, "\\'")}')" title="ベトナム語で読み上げ">🔊</button>` : ''}
                        </div>
                        <div class="history-translation">
                            ${entry.translatedText}
                            ${!isVietnamese && hasVietnamese ? `<button class="speaker-btn" onclick="event.stopPropagation(); voiceTranslator.speakVietnamese('${vietnameseText.replace(/'/g, "\\'")}')" title="ベトナム語で読み上げ">🔊</button>` : ''}
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

    // ベトナム語音声読み上げ機能
    speakVietnamese(text) {
        if (!text || text.trim() === '') {
            console.log('テキストが空です');
            return;
        }

        // Web Speech API のサポート確認
        if (!('speechSynthesis' in window)) {
            alert('お使いのブラウザは音声合成をサポートしていません。');
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
            };

            utterance.onstart = () => {
                console.log('ベトナム語音声開始:', text);
            };

            utterance.onend = () => {
                console.log('ベトナム語音声終了');
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