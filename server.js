const express = require('express');
const { Translate } = require('@google-cloud/translate').v2;
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const translate = new Translate({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

app.post('/api/translate', async (req, res) => {
    try {
        const { text, source, target } = req.body;
        
        if (!text || !source || !target) {
            return res.status(400).json({ error: 'テキスト、元言語、翻訳先言語が必要です' });
        }

        const [translation] = await translate.translate(text, {
            from: source,
            to: target,
        });

        res.json({ 
            translatedText: translation,
            originalText: text,
            sourceLanguage: source,
            targetLanguage: target 
        });
    } catch (error) {
        console.error('翻訳エラー:', error);
        res.status(500).json({ 
            error: '翻訳に失敗しました',
            details: error.message 
        });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`サーバーがポート${port}で起動しました`);
    console.log(`http://localhost:${port} でアクセスできます`);
});