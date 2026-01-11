// ==UserScript==
// @name         Jisho to Anki Card Copier
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Copy Jisho word information formatted for Anki flashcard back side
// @author       You
// @match        https://jisho.org/word/*
// @match        https://jisho.org/search/*
// @icon         https://jisho.org/assets/touch-icon-017b99ca4bfd11363a97f66cc4c00b1667613a05e38d08d858aa5e2a35dce055.png
// @grant        GM_setClipboard
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    // Add CSS for the copy button
    const style = document.createElement('style');
    style.textContent = `
        .anki-copy-button {
            background-color: #47DB27;
            color: white;
            border: none;
            padding: 8px 16px;
            margin: 10px 0;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background-color 0.3s;
        }
        .anki-copy-button:hover {
            background-color: #3ac420;
        }
        .anki-copy-button:active {
            background-color: #2ea018;
        }
    `;
    document.head.appendChild(style);

    // Function to extract word information
    function extractWordInfo() {
        const conceptLight = document.querySelector('.concept_light');
        if (!conceptLight) {
            return null;
        }

        const info = {};

        // Get the main reading and kanji
        const reading = conceptLight.querySelector('.concept_light-representation');
        if (reading) {
            info.word = reading.textContent.trim().replace(/\s+/g, '');

            // Extract furigana and kanji separately
            const furiganaSpan = reading.querySelector('.furigana');
            const textSpan = reading.querySelector('.text');

            if (furiganaSpan && textSpan) {
                // Get furigana reading
                const furiganaText = furiganaSpan.textContent.trim().replace(/\s+/g, '');
                // Get the kanji/kana text
                const kanjiText = textSpan.textContent.trim().replace(/\s+/g, '');

                info.furigana = furiganaText;
                info.kanji = kanjiText;
            }
        }

        // Get tags (Common word, JLPT level, etc.)
        info.tags = [];
        const tags = conceptLight.querySelectorAll('.concept_light-tag');
        tags.forEach(tag => {
            const tagText = tag.textContent.trim();
            if (tagText && !tagText.includes('Wanikani')) {
                info.tags.push(tagText);
            }
        });

        // Get meanings with definitions
        info.meanings = [];
        const meaningWrappers = conceptLight.querySelectorAll('.meaning-wrapper');
        meaningWrappers.forEach(wrapper => {
            const meaningObj = {};

            // Get part of speech
            const pos = wrapper.previousElementSibling;
            if (pos && pos.classList.contains('meaning-tags')) {
                meaningObj.partOfSpeech = pos.textContent.trim();
            }

            // Get definition
            const definition = wrapper.querySelector('.meaning-meaning');
            if (definition) {
                meaningObj.definition = definition.textContent.trim();
            }

            // Get supplemental info (restrictions, usage notes)
            const suppInfo = wrapper.querySelector('.supplemental_info');
            if (suppInfo) {
                meaningObj.notes = suppInfo.textContent.trim();
            }

            // Get example sentences
            meaningObj.examples = [];
            const sentences = wrapper.querySelectorAll('.sentence');
            sentences.forEach(sentence => {
                const japanese = sentence.querySelector('.japanese');
                const english = sentence.querySelector('.english');
                if (japanese && english) {
                    // Extract Japanese with furigana structure preserved
                    let japaneseHTML = '';

                    // Get all child nodes including text nodes
                    const childNodes = japanese.childNodes;

                    childNodes.forEach(node => {
                        // If it's a text node (like "１０２゜Ｆ")
                        if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.textContent.trim();
                            if (text) {
                                japaneseHTML += text;
                            }
                        }
                        // If it's an element node (li)
                        else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'LI') {
                            const furigana = node.querySelector('.furigana');
                            const unlinked = node.querySelector('.unlinked');

                            if (furigana && unlinked) {
                                // Has furigana - need to figure out which part gets the reading
                                const furiganaText = furigana.textContent.trim();
                                const fullText = unlinked.textContent.trim();

                                // Check if the unlinked span contains kanji
                                const kanjiMatch = fullText.match(/^[\u4e00-\u9faf\u3400-\u4dbf]+/);

                                if (kanjiMatch) {
                                    // Found kanji at the start
                                    const kanjiPart = kanjiMatch[0];
                                    const remainder = fullText.substring(kanjiPart.length);
                                    japaneseHTML += `<ruby>${kanjiPart}<rt>${furiganaText}</rt></ruby>${remainder}`;
                                } else {
                                    // No kanji found, just use the full text
                                    japaneseHTML += fullText;
                                }
                            } else if (unlinked) {
                                // No furigana - just plain text
                                japaneseHTML += unlinked.textContent.trim();
                            }
                        }
                    });

                    meaningObj.examples.push({
                        japanese: japaneseHTML || japanese.textContent.trim().replace(/\s+/g, ''),
                        english: english.textContent.trim()
                    });
                }
            });

            if (meaningObj.definition) {
                info.meanings.push(meaningObj);
            }
        });

        // Get other forms
        const otherForms = Array.from(conceptLight.querySelectorAll('.meaning-wrapper'))
            .find(w => {
                const tags = w.previousElementSibling;
                return tags && tags.textContent.includes('Other forms');
            });
        if (otherForms) {
            const formsText = otherForms.querySelector('.meaning-meaning');
            if (formsText) {
                info.otherForms = formsText.textContent.trim()
                    .split('、')
                    .map(f => f.trim())
                    .filter(f => f);
            }
        }

        // Get kanji information
        info.kanjiInfo = [];
        const kanjiBlocks = document.querySelectorAll('.kanji_light');
        kanjiBlocks.forEach(block => {
            const kanjiObj = {};

            const literal = block.querySelector('.literal');
            if (literal) {
                kanjiObj.character = literal.textContent.trim();
            }

            const meaning = block.querySelector('.meanings.english');
            if (meaning) {
                kanjiObj.meaning = meaning.textContent.trim();
            }

            const kunReading = block.querySelector('.kun.readings');
            if (kunReading) {
                const readings = Array.from(kunReading.querySelectorAll('a'))
                    .map(a => a.textContent.trim())
                    .filter(r => r);
                if (readings.length > 0) {
                    kanjiObj.kun = readings.join('、 ');
                }
            }

            const onReading = block.querySelector('.on.readings');
            if (onReading) {
                const readings = Array.from(onReading.querySelectorAll('a'))
                    .map(a => a.textContent.trim())
                    .filter(r => r);
                if (readings.length > 0) {
                    kanjiObj.on = readings.join('、 ');
                }
            }

            if (kanjiObj.character) {
                info.kanjiInfo.push(kanjiObj);
            }
        });

        return info;
    }

    // Function to format information for Anki
    function formatForAnki(info) {
        if (!info) {
            return "No word information found on this page.";
        }

        let formatted = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: 'Hiragino Kaku Gothic Pro', 'Meiryo', 'MS Gothic', sans-serif;
            line-height: 1.6;
            color: #333;
            padding: 10px;
            margin: 0;
        }
        .tags {
            margin-bottom: 10px;
            color: #666;
            font-size: 12px;
        }
        .reading-box {
            margin: 15px 0 20px 0;
            padding: 15px;
            background-color: #f0f8ff;
            border-left: 4px solid #47DB27;
            border-radius: 5px;
        }
        .kanji-text {
            font-size: 28px;
            font-weight: medium;
            margin-bottom: 8px;
            color: #333;
        }
        .furigana-text {
            font-size: 18px;
            color: #666;
        }
        .meaning-section {
            margin-top: 15px;
        }
        .part-of-speech {
            font-weight: bold;
            color: #47DB27;
            font-size: 12px;
        }
        .definition {
            margin: 5px 0;
        }
        .notes {
            margin: 5px 0;
            font-size: 12px;
            color: #888;
        }
        .examples {
            margin: 10px 0 10px 20px;
            font-style: italic;
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
        }
        .example-ja {
            margin: 5px 0;
            color: #333;
            font-size: 16px;
        }
        ruby {
            ruby-position: over;
        }
        rt {
            font-size: 0.6em;
            color: #666;
        }
        .example-en {
            margin: 5px 0 10px 0;
            color: #666;
            font-size: 13px;
        }
        .other-forms {
            margin-top: 15px;
        }
        .other-forms-label {
            font-weight: bold;
        }
        .kanji-breakdown {
            margin-top: 20px;
            border-top: 1px solid #ddd;
            padding-top: 15px;
        }
        .kanji-breakdown-title {
            font-weight: bold;
        }
        .kanji-item {
            margin: 10px 0;
            padding: 10px;
            background-color: #f9f9f9;
            border-left: 3px solid #47DB27;
        }
        .kanji-character {
            font-size: 24px;
            margin-bottom: 5px;
            color: #333;
        }
        .kanji-detail {
            margin: 5px 0;
            color: #555;
        }
    </style>
</head>
<body>
`;

        // Add tags if present
        if (info.tags.length > 0) {
            formatted += `    <div class="tags">${info.tags.join(' • ')}</div>\n`;
        }

        // Add furigana/reading at the top
        if (info.kanji && info.furigana) {
            formatted += `    <div class="reading-box">\n`;
            formatted += `        <div class="kanji-text">${info.kanji}</div>\n`;
            formatted += `        <div class="furigana-text">${info.furigana}</div>\n`;
            formatted += `    </div>\n`;
        } else if (info.word) {
            formatted += `    <div class="reading-box">\n`;
            formatted += `        <div class="kanji-text">${info.word}</div>\n`;
            formatted += `    </div>\n`;
        }

        // Add meanings and definitions
        info.meanings.forEach((meaning, index) => {
            // Skip "Other forms" entry
            if (meaning.partOfSpeech && meaning.partOfSpeech.includes('Other forms')) {
                return;
            }

            formatted += `    <div class="meaning-section">\n`;

            if (meaning.partOfSpeech) {
                formatted += `        <div class="part-of-speech">${meaning.partOfSpeech}</div>\n`;
            }

            if (meaning.definition) {
                formatted += `        <div class="definition">${meaning.definition}</div>\n`;
            }

            if (meaning.notes) {
                formatted += `        <div class="notes">ℹ️ ${meaning.notes}</div>\n`;
            }

            // Add example sentences
            if (meaning.examples.length > 0) {
                formatted += `        <div class="examples">\n`;
                meaning.examples.forEach(ex => {
                    formatted += `            <div class="example-ja">${ex.japanese}</div>\n`;
                    formatted += `            <div class="example-en">${ex.english}</div>\n`;
                });
                formatted += `        </div>\n`;
            }

            formatted += `    </div>\n`;
        });

        // Add other forms
        if (info.otherForms && info.otherForms.length > 0) {
            formatted += `    <div class="other-forms"><span class="other-forms-label">Other forms:</span> ${info.otherForms.join('、 ')}</div>\n`;
        }

        // Add kanji information
        if (info.kanjiInfo && info.kanjiInfo.length > 0) {
            formatted += `    <div class="kanji-breakdown">\n`;
            formatted += `        <div class="kanji-breakdown-title">Kanji breakdown:</div>\n`;
            info.kanjiInfo.forEach(k => {
                formatted += `        <div class="kanji-item">\n`;
                formatted += `            <div class="kanji-character">${k.character}</div>\n`;
                if (k.meaning) {
                    formatted += `            <div class="kanji-detail">Meaning: ${k.meaning}</div>\n`;
                }
                if (k.kun) {
                    formatted += `            <div class="kanji-detail">Kun: ${k.kun}</div>\n`;
                }
                if (k.on) {
                    formatted += `            <div class="kanji-detail">On: ${k.on}</div>\n`;
                }
                formatted += `        </div>\n`;
            });
            formatted += `    </div>\n`;
        }

        formatted += `</body>\n</html>`;

        return formatted;
    }

    // Function to copy to clipboard
    function copyToClipboard() {
        const info = extractWordInfo();
        const formatted = formatForAnki(info);

        // Try modern Clipboard API first (works better in most browsers)
        if (navigator.clipboard && navigator.clipboard.write) {
            const blob = new Blob([formatted], { type: 'text/html' });
            const clipboardItem = new ClipboardItem({
                'text/html': blob,
                'text/plain': new Blob([formatted], { type: 'text/plain' })
            });

            navigator.clipboard.write([clipboardItem]).then(() => {
                GM_notification({
                    title: 'Copied to Clipboard!',
                    text: 'HTML copied - paste into Anki card editor',
                    timeout: 2000
                });
            }).catch(err => {
                // Fallback to GM_setClipboard
                fallbackCopy(formatted);
            });
        } else {
            // Fallback for older browsers or when Clipboard API unavailable
            fallbackCopy(formatted);
        }

        console.log('Copied Anki card data:', formatted);
    }

    // Fallback copy function
    function fallbackCopy(formatted) {
        // Copy as plain text (will show HTML source)
        GM_setClipboard(formatted, 'text');

        // Show notification with instructions
        GM_notification({
            title: 'Copied to Clipboard!',
            text: 'Paste into Anki HTML editor (click </> button)',
            timeout: 3000
        });
    }

    // Add copy button to the page
    function addCopyButton() {
        const conceptLight = document.querySelector('.concept_light');
        if (!conceptLight) {
            return;
        }

        // Check if button already exists
        if (document.querySelector('.anki-copy-button')) {
            return;
        }

        const button = document.createElement('button');
        button.textContent = '📋 Copy to Anki';
        button.className = 'anki-copy-button';
        button.onclick = copyToClipboard;

        // Insert button after the readings section
        const readings = conceptLight.querySelector('.concept_light-readings');
        if (readings) {
            readings.parentNode.insertBefore(button, readings.nextSibling);
        } else {
            conceptLight.insertBefore(button, conceptLight.firstChild);
        }
    }

    // Initialize when page loads
    function init() {
        // Wait for content to load
        const observer = new MutationObserver((mutations, obs) => {
            if (document.querySelector('.concept_light')) {
                addCopyButton();
                obs.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also try to add immediately if content is already present
        addCopyButton();
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Add keyboard shortcut (Ctrl+Shift+C or Cmd+Shift+C)
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            const conceptLight = document.querySelector('.concept_light');
            if (conceptLight) {
                copyToClipboard();
            }
        }
    });

})();
