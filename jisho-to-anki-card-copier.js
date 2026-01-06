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
                    meaningObj.examples.push({
                        japanese: japanese.textContent.trim().replace(/\s+/g, ''),
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

        let formatted = '';

        // Add tags if present
        if (info.tags.length > 0) {
            formatted += `<div style="margin-bottom: 10px; color: #666; font-size: 12px;">${info.tags.join(' • ')}</div>\n`;
        }

        // Add furigana/reading at the top
        if (info.kanji && info.furigana) {
            formatted += `<div style="margin: 15px 0 20px 0; padding: 15px; background-color: #f0f8ff; border-left: 4px solid #47DB27; border-radius: 5px;">\n`;
            formatted += `<div style="font-size: 28px; font-weight: bold; margin-bottom: 8px; color: #333;">${info.kanji}</div>\n`;
            formatted += `<div style="font-size: 18px; color: #666;">${info.furigana}</div>\n`;
            formatted += `</div>\n`;
        } else if (info.word) {
            formatted += `<div style="margin: 15px 0 20px 0; padding: 15px; background-color: #f0f8ff; border-left: 4px solid #47DB27; border-radius: 5px;">\n`;
            formatted += `<div style="font-size: 28px; font-weight: bold; color: #333;">${info.word}</div>\n`;
            formatted += `</div>\n`;
        }

        // Add meanings and definitions
        info.meanings.forEach((meaning, index) => {
            // Skip "Other forms" entry
            if (meaning.partOfSpeech && meaning.partOfSpeech.includes('Other forms')) {
                return;
            }

            if (meaning.partOfSpeech) {
                formatted += `<div style="margin-top: 15px;"><b style="color: #47DB27;">${meaning.partOfSpeech}</b></div>\n`;
            }

            if (meaning.definition) {
                formatted += `<div style="margin: 5px 0;">${meaning.definition}</div>\n`;
            }

            if (meaning.notes) {
                formatted += `<div style="margin: 5px 0; font-size: 12px; color: #888;">ℹ️ ${meaning.notes}</div>\n`;
            }

            // Add example sentences
            if (meaning.examples.length > 0) {
                formatted += `<div style="margin: 10px 0 10px 20px; font-style: italic; background-color: #f5f5f5; padding: 10px; border-radius: 5px;">\n`;
                meaning.examples.forEach(ex => {
                    formatted += `<div style="margin: 5px 0; color: #333;">${ex.japanese}</div>\n`;
                    formatted += `<div style="margin: 5px 0 10px 0; color: #666; font-size: 13px;">${ex.english}</div>\n`;
                });
                formatted += `</div>\n`;
            }
        });

        // Add other forms
        if (info.otherForms && info.otherForms.length > 0) {
            formatted += `<div style="margin-top: 15px;"><b>Other forms:</b> ${info.otherForms.join('、 ')}</div>\n`;
        }

        // Add kanji information
        if (info.kanjiInfo && info.kanjiInfo.length > 0) {
            formatted += `<div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;"><b>Kanji breakdown:</b></div>\n`;
            info.kanjiInfo.forEach(k => {
                formatted += `<div style="margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #47DB27;">\n`;
                formatted += `<div style="font-size: 24px; margin-bottom: 5px;">${k.character}</div>\n`;
                if (k.meaning) {
                    formatted += `<div style="margin: 5px 0; color: #555;">Meaning: ${k.meaning}</div>\n`;
                }
                if (k.kun) {
                    formatted += `<div style="margin: 5px 0; color: #555;">Kun: ${k.kun}</div>\n`;
                }
                if (k.on) {
                    formatted += `<div style="margin: 5px 0; color: #555;">On: ${k.on}</div>\n`;
                }
                formatted += `</div>\n`;
            });
        }

        return formatted;
    }

    // Function to copy to clipboard
    function copyToClipboard() {
        const info = extractWordInfo();
        const formatted = formatForAnki(info);

        // Copy HTML to clipboard
        GM_setClipboard(formatted, 'html');

        // Show notification
        GM_notification({
            title: 'Copied to Clipboard!',
            text: 'Jisho information copied for Anki',
            timeout: 2000
        });

        console.log('Copied Anki card data:', formatted);
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
