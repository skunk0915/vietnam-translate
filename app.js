class VoiceTranslator {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.currentLanguage = null;
        this.history = JSON.parse(localStorage.getItem('translationHistory') || '[]');
        
        this.init();
    }

    init() {
        this.setupSpeechRecognition();
        this.setupEventListeners();
        this.loadHistory();
    }

    setupSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('お使いのブラウザは音声認識をサポートしていません。');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        this.recognition.onstart = () => {
            console.log('音声認識開始');
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                this.handleSpeechResult(finalTranscript.trim());
            } else if (interimTranscript) {
                this.updateContent(this.currentLanguage, interimTranscript, true);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('音声認識エラー:', event.error);
            this.stopListening();
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                this.recognition.start();
            }
        };
    }

    setupEventListeners() {
        document.getElementById('japaneseMic').addEventListener('click', () => {
            this.toggleRecognition('ja');
        });

        document.getElementById('vietnameseMic').addEventListener('click', () => {
            this.toggleRecognition('vi');
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
    }

    toggleRecognition(language) {
        if (this.isListening && this.currentLanguage === language) {
            this.stopListening();
        } else {
            this.startListening(language);
        }
    }

    startListening(language) {
        if (this.isListening) {
            this.stopListening();
        }

        this.currentLanguage = language;
        this.isListening = true;

        if (language === 'ja') {
            this.recognition.lang = 'ja-JP';
            document.getElementById('japaneseMic').classList.add('active');
            document.getElementById('japaneseStatus').textContent = '聞いています...';
            document.getElementById('japaneseStatus').classList.add('listening');
            document.getElementById('japaneseContent').textContent = '';
        } else {
            this.recognition.lang = 'vi-VN';
            document.getElementById('vietnameseMic').classList.add('active');
            document.getElementById('vietnameseStatus').textContent = 'Đang nghe...';
            document.getElementById('vietnameseStatus').classList.add('listening');
            document.getElementById('vietnameseContent').textContent = '';
        }

        this.recognition.start();
    }

    stopListening() {
        this.isListening = false;
        this.recognition.stop();

        document.getElementById('japaneseMic').classList.remove('active');
        document.getElementById('vietnameseMic').classList.remove('active');
        document.getElementById('japaneseStatus').textContent = '待機中';
        document.getElementById('vietnameseStatus').textContent = 'Chờ';
        document.getElementById('japaneseStatus').classList.remove('listening');
        document.getElementById('vietnameseStatus').classList.remove('listening');
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
        }
    }

    async handleSpeechResult(text) {
        console.log('認識結果:', text);
        
        this.updateContent(this.currentLanguage, text);

        try {
            const translatedText = await this.translateText(text, this.currentLanguage);
            const targetLanguage = this.currentLanguage === 'ja' ? 'vi' : 'ja';
            
            this.updateContent(targetLanguage, translatedText);
            
            this.addToHistory({
                timestamp: new Date(),
                originalLanguage: this.currentLanguage,
                originalText: text,
                translatedText: translatedText,
                targetLanguage: targetLanguage
            });

        } catch (error) {
            console.error('翻訳エラー:', error);
            const errorMessage = this.currentLanguage === 'ja' 
                ? '翻訳に失敗しました' 
                : 'Dịch thất bại';
            
            const targetLanguage = this.currentLanguage === 'ja' ? 'vi' : 'ja';
            this.updateContent(targetLanguage, errorMessage);
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
            historyList.innerHTML = this.history.map(entry => {
                const date = new Date(entry.timestamp);
                const isVietnamese = entry.originalLanguage === 'vi';
                
                return `
                    <div class="history-item ${isVietnamese ? 'vietnamese' : ''}">
                        <div class="history-timestamp">${date.toLocaleString('ja-JP')}</div>
                        <div class="history-text">${entry.originalText}</div>
                        <div class="history-translation">${entry.translatedText}</div>
                    </div>
                `;
            }).join('');
        }
        
        modal.classList.remove('hidden');
    }

    hideHistory() {
        document.getElementById('historyModal').classList.add('hidden');
    }

    clearHistory() {
        if (confirm('履歴をすべて削除しますか？')) {
            this.history = [];
            this.saveHistory();
            this.hideHistory();
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

document.addEventListener('DOMContentLoaded', () => {
    new VoiceTranslator();
});