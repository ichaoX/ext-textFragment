console.log('background start');

let settings = {};

let boundedPattern = `[\\s\\p{P}\\p{S}]`;

try {
    new RegExp(`(?<=1)${boundedPattern}`, 'u');
} catch (e) {
    boundedPattern = `[\\s,.:;!?(){}\\[\\]\\-…\\\\|/"'~_=%+*，。：；！？（）{}【】—…、《》“”‘’／]`;
    console.warn('Your browser only supports simple regular expressions, so some functionality will be degraded!');
}

let parseRawDirectives = (fragment) => {
    /*
    let params = new URLSearchParams(match[1]);
    let textDirective = params.getAll('text');
    */
    return fragment.split(/&+/).reduce((p, c) => {
        let part = c.split(/^([^=]*)=/);
        if (part.length == 3) {
            part.shift();
        } else {
            part.push('');
        }
        let name = decodeURIComponent(part[0]);
        if (!p[name]) p[name] = [];
        p[name].push(part[1]);
        return p;
    }, {});
};

let parseTextDirectives = (rawDirectives = []) => {
    let result = [];
    for (let text of rawDirectives) {
        try {
            if (decodeURIComponent(text).trim() === '') continue;
            let fullText, startText, contextPattern;
            let match = text.match(/^(?:([^,]+)-,)?([^,]+)(?:,([^,-][^,]*))?(?:,-([^,]+))?$/);
            if (match) {
                let [_, prefix, start, end, suffix] = match;
                startText = decodeURIComponent(start);
                if (prefix === undefined && end === undefined && suffix === undefined) {
                    fullText = startText;
                } else {
                    let pattern = regExpQuote(startText);
                    if (end) pattern += `[^]*?${regExpQuote(decodeURIComponent(end))}`;
                    contextPattern = (prefix ? `(${regExpQuote(decodeURIComponent(prefix))}\\s*)` : '()')
                        + `(${pattern})`
                        + (suffix ? `(\\s*${regExpQuote(decodeURIComponent(suffix))})` : '()');
                    util.log(JSON.stringify(contextPattern));
                }
            } else {
                fullText = startText = decodeURIComponent(text);
            }
            result.push({
                fullText,
                startText,
                contextPattern,
            });
        } catch (e) {
            console.warn(e);
        }
    }
    return result;
};

let buildTextDirective = async (context, innerText = null) => {
    let fullText = context.text.trim().replace(/\r?\n\r?/g, "\n");
    if (!context.prefix) context.prefix = context.prefix_long || '';
    if (!context.suffix) context.suffix = context.suffix_long || '';
    if (!context.prefix_long) context.prefix_long = context.prefix;
    if (!context.suffix_long) context.suffix_long = context.suffix;
    let textDirective, rangeMatch;
    // XXX Intl.Segmenter
    let isWordSeparatedBySpace = /^[\x00-\x7F]*$/.test(fullText);
    if (!isWordSeparatedBySpace) {
        let detectingLanguages = await browser.i18n.detectLanguage(fullText);
        if (!(detectingLanguages.isReliable && detectingLanguages.languages[0]) && (context.prefix_long || context.suffix_long)) {
            detectingLanguages = await browser.i18n.detectLanguage(`${context.prefix_long}${context.text}${context.suffix_long}`);
        }
        util.log(detectingLanguages);
        if (detectingLanguages.isReliable && detectingLanguages.languages[0]) {
            let language = detectingLanguages.languages[0].language.replace(/[\-_].*$/, '');
            isWordSeparatedBySpace = 'en|fr|de|it|es|pt|sv|no|da|nl|hu|cs|sk|hr|sr|sl|pl|bg|ro'.split('|').includes(language);
        }
    }
    let pattern;
    if ((fullText.length >= settings.exact_match_limit || fullText.includes("\n")) && (rangeMatch = fullText.match(isWordSeparatedBySpace ? /^(\S+(?:\s+\S+){0,4})\s[^]*?\s((?:\S+\s+){1,4}\S+)$/ : new RegExp(`^([^]*?\\S)${boundedPattern}[^]*${boundedPattern}(\\S[^]*?)$`, 'u')))) {
        let [_, start, end] = rangeMatch;
        // XXX
        let startText = start.replace(/[\r\n][^]*$/, '');
        let endText = end.replace(/^[^]*[\n\r]/, '');
        textDirective = `${encodeTextDirectiveString(startText)},${encodeTextDirectiveString(endText)}`;
        pattern = `${regExpQuote(startText)}[^]*?${regExpQuote(endText)}`;
    } else {
        textDirective = encodeTextDirectiveString(fullText);
        pattern = regExpQuote(fullText);
    }
    if (context.prefix_long || context.suffix_long) {
        let wordCount = isWordSeparatedBySpace ? fullText.split(/\s+/).length : fullText.length;
        let useContext = wordCount <= 3;
        if (!useContext && innerText && pattern) {
            let match = innerText.match(new RegExp(pattern, 'ig'));
            util.log(match);
            // XXX
            if (match && (match.length > 1 || match[0].replace(/\s+/g, ' ').toLowerCase() != fullText.replace(/\s+/g, ' ').toLowerCase())) useContext = true;
        }
        if (useContext) {
            let prefix = (isWordSeparatedBySpace ? context.prefix_long : context.prefix).trim().replace(/\r?\n\r?/g, "\n").replace(/^[^]*[\n\r]/, '').trim();
            let suffix = (isWordSeparatedBySpace ? context.suffix_long : context.suffix).trim().replace(/\r?\n\r?/g, "\n").replace(/[\r\n][^]*$/, '').trim();
            if (prefix.length > 10) prefix = prefix.replace(isWordSeparatedBySpace ? /(?:^[^]*?\s)(\S+(\s+\S+){2}$)/ : new RegExp(`(?:^[^]*${boundedPattern})(\\S[^]*?$)`, 'u'), '$1');
            if (suffix.length > 10) suffix = suffix.replace(isWordSeparatedBySpace ? /(^\S+(\s+\S+){2})(?:\s[^]*?)$/ : new RegExp(`(^[^]*?\\S)(?:${boundedPattern}[^]*)$`, 'u'), '$1');
            if (suffix) textDirective += `,-${encodeTextDirectiveString(suffix)}`;
            if (prefix) textDirective = `${encodeTextDirectiveString(prefix)}-,${textDirective}`;
        }
    }
    return textDirective;
};

let regExpQuote = (str) => {
    let chars = '.\\+*?[^]$(){}=!<>|:-#';
    return str.replace(new RegExp(`([${chars.replace(/(.)/g, '\\$1')}])`, 'g'), '\\$1');
};

let regExpExecAll = (reg0, text) => {
    let reg = new RegExp(reg0.source, reg0.flags);
    let result = [];
    let match;
    while ((match = reg.exec(text)) !== null) {
        result.push(match);
        if (reg.lastIndex === 0) break;
    }
    return result;
};

let encodeTextDirectiveString = (text) => {
    // https://wicg.github.io/scroll-to-text-fragment/#textdirectiveexplicitchar
    let allowRegExp = new RegExp(`[a-zA-Z0-9${regExpQuote("!$'\"()*+./:;=?@_~")}]`);
    let result = '';
    for (let i = 0; i < text.length; i++) {
        let char = text.charAt(i);
        if (!char.match(allowRegExp)) {
            let charCode = char.charCodeAt(0);
            if (charCode < 128) {
                let hexChar = charCode.toString(16);
                result += '%' + hexChar.padStart(2, '0').toUpperCase();
            } else {
                // let byte1 = 0xc0 | ((charCode >> 6) & 0x1f);
                // let byte2 = 0x80 | (charCode & 0x3f);
                result += encodeURIComponent(char);
            }
        } else {
            result += char;
        }
    }
    return result;
};

let findText = async (textDirectives, tabId, frameId = 0, retry = 0) => {
    let textDirectiveDetails = parseTextDirectives(textDirectives);
    if (!textDirectiveDetails.length) return false;
    util.log(textDirectiveDetails);
    const isAutoMode = settings.highlight_type === 'auto';
    let useSelection = settings.highlight_type === 'selection' || !browser.find;
    let findRange = async (pattern, scroll = false) => {
        return await loadHelper(tabId, frameId,
            `_helper.findRange(${JSON.stringify(pattern)},${scroll})`
        );
    };
    try {
        let innerText = null;
        let r = false;
        for (let detail of textDirectiveDetails) {
            let fullText = detail.fullText, startText = detail.startText, rangeIndex = 0, highlightAll = true, contextRegExp, result = false;
            // XXX
            let fixSubSearch = async (searchString = null) => {
                if (!contextRegExp) return false;
                if (innerText === null) innerText = await getInnerText(tabId, frameId);
                let matchDetails = regExpExecAll(contextRegExp, innerText);
                if (!matchDetails.length) return false;
                let match = matchDetails[0];
                if (searchString == null) {
                    fullText = searchString = match[match.length == 4 ? 2 : 0];
                }
                let subRegExp = new RegExp(regExpQuote(searchString), 'ig');
                let matchDetails2 = regExpExecAll(subRegExp, innerText);
                util.log(matchDetails, matchDetails2);
                if (!matchDetails2.length) return false;
                for (let i = 0; i < matchDetails2.length; i++) {
                    let match2 = matchDetails2[i];
                    if (match2.index !== undefined && match2.index === match.index + (match.length == 4 ? match[1].length : 0)) {
                        if (matchDetails.length == 1) highlightAll = false;
                        rangeIndex = i;
                        util.log(rangeIndex);
                        return true;
                    }
                }
                return false;
            };
            if (detail.contextPattern) {
                contextRegExp = new RegExp(detail.contextPattern, 'ig');
                if (!useSelection && !await fixSubSearch() && retry > 0) continue;
            }
            fullText = fullText || startText;
            if (useSelection || fullText.includes("\n") || r) {
                if (isAutoMode && !useSelection) useSelection = true;
                browser.tabs.executeScript(tabId, {
                    frameId,
                    matchAboutBlank: true,
                    code: `console.info(${JSON.stringify(fullText)})`,
                });
            }
            if (useSelection) {
                if (result = await findRange(detail.contextPattern || regExpQuote(detail.fullText || startText), !r)) {
                    r = true;
                } else if (retry == 0 && startText) {
                    if (result = await findRange(`()(${regExpQuote(startText)})()`, !r)) {
                        r = true;
                    }
                }
                util.log(result);
                continue;
            }
            if (r) continue;
            if (fullText.includes("\n")) {
                if (!contextRegExp) contextRegExp = new RegExp(regExpQuote(fullText), 'ig');
                fullText = fullText.trim().replace(/\n[^]*$/, '');
                await fixSubSearch(fullText);
            }
            result = await browser.find.find(fullText, {
                tabId,
                caseSensitive: false,
            });
            if (result.count == 0 && retry == 0 && startText) {
                rangeIndex = 0;
                highlightAll = true;
                result = await browser.find.find(startText, {
                    tabId,
                    caseSensitive: false,
                })
            }
            util.log(result);
            if (result.count > 0) {
                // scroll into frist
                await browser.find.highlightResults({
                    tabId,
                    rangeIndex,
                    noScroll: false,
                });
                // highlight all
                if (highlightAll && result.count > 1 && rangeIndex == 0) {
                    await browser.find.highlightResults({
                        tabId,
                    });
                }
                r = true;
                await loadHelper(tabId, frameId,
                    `_helper.state.highlighted = true`
                );
            } else {
                util.log(fullText);
            }
        }
        if (r) {
            try {
                await loadHelper(tabId, frameId,
                    `_helper.state.textDirectives = ${JSON.stringify(textDirectives)}`
                );
            } catch (e) {
                console.warn(e);
            }
            return r;
        }
    } catch (e) {
        console.warn(e);
        console.trace();
    }
    if (retry > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retry--;
        util.log('retry', retry);
        return await findText(textDirectives, tabId, frameId, retry);
    }
    return false;
};

let getInnerText = async (tabId, frameId) => {
    let innerText = '';
    try {
        innerText = (await browser.tabs.executeScript(tabId, {
            frameId,
            matchAboutBlank: true,
            code: `document.documentElement.innerText`,
        }))[0];
    } catch (e) {
        console.warn(e);
    }
    return innerText;
};

let loadHelper = async (tabId, frameId, code = null) => {
    if (!(await browser.tabs.executeScript(tabId, {
        frameId,
        matchAboutBlank: true,
        code: "typeof _helper !== 'undefined'",
    }))[0]) {
        await Promise.all([
            browser.tabs.executeScript(tabId, {
                frameId,
                matchAboutBlank: true,
                file: "/lib/helper.js",
            }),
            browser.tabs.insertCSS(tabId, {
                frameId,
                matchAboutBlank: true,
                file: "/lib/helper.css",
            }).catch(e => console.warn(e)),
        ]);
        if (util.debug) {
            await browser.tabs.executeScript(tabId, {
                frameId,
                matchAboutBlank: true,
                code: `_helper.debug = true`,
            });

        }
    }
    if (code) {
        return (await browser.tabs.executeScript(tabId, {
            frameId,
            matchAboutBlank: true,
            code,
        }))[0];
    }
};

let removeFragmentDirectives = async (tabId, frameId) => {
    try {
        await loadHelper(tabId, frameId,
            `_helper.removeFragmentDirectives()`
        );
    } catch (e) {
        console.warn(e);
    }
};

let copyText = async (text, options = {}) => {
    let tabId = options.tabId;
    let frameId = options.frameId;
    try {
        await loadHelper(tabId, frameId,
            `_helper.copyToClipboard(${JSON.stringify(text)});`
        );
    } catch (e) {
        console.warn(e);
    }
};

let mutex = {};

let listener = async (details) => {
    let mKey;
    try {
        let match = details.url.match(/#.*?:~:(.*)$/);
        if (!match) return;
        let directives = parseRawDirectives(match[1]);
        let tabId = details.tabId;
        let frameId = details.frameId;
        mKey = `${tabId}_${frameId}`;
        if (mutex[mKey]) {
            mKey = null;
            throw 'cancel';
        }
        mutex[mKey] = true;
        if (settings.remove_fragment_directive) {
            await removeFragmentDirectives(tabId, frameId);
        }
        let textDirectives = directives.text;
        if (!textDirectives || !textDirectives.length) {
            // browser.find.removeHighlighting();
            return;
        }
        util.log(details, textDirectives);
        await findText(textDirectives, tabId, frameId, 5);
    } catch (e) {
        console.warn(e);
    } finally {
        if (mKey) delete mutex[mKey];
    }
};

util.addListener(browser.webNavigation.onDOMContentLoaded, listener);
util.addListener(browser.webNavigation.onReferenceFragmentUpdated, listener);
util.addListener(browser.webNavigation.onHistoryStateUpdated, listener);

let action = {
    async copyLink(tabId, frameId, url, ranges = []) {
        try {
            let r = (await loadHelper(tabId, frameId,
                `_helper.getSelectionText(${JSON.stringify(settings.extend_incomplete_word)})`
            )).filter(e => !!e.text.trim());
            if (r.length > 0) ranges = r;
        } catch (e) {
            console.warn(e);
        }
        util.log(ranges);
        let directives = [];
        let innerText = await getInnerText(tabId, frameId);
        for (let range of ranges) {
            directives.push(`text=${await buildTextDirective(range, innerText)}`);
        }
        // XXX
        if (url === 'about:blank' && frameId != 0) {
            url = (await browser.tabs.executeScript(tabId, {
                frameId,
                matchAboutBlank: true,
                code: `parent.location.href`,
            }))[0];
        }
        let urlObj = new URL(url);
        if (!settings.keep_url_hash) urlObj.hash = "";
        urlObj.hash = urlObj.hash.replace(/(:~:.*$)|$/, ':~:' + directives.join('&'));
        let href = urlObj.href;
        util.log(href);
        await copyText(href, {
            tabId,
            frameId,
        });
    },
    async removeHighlight(tabId, frameId) {
        await browser.tabs.executeScript(tabId, {
            frameId,
            matchAboutBlank: true,
            code: `typeof _helper !== 'undefined' && (_helper.state.highlighted = false)`,
        });
        // XXX
        await browser.find.removeHighlighting();
    },
    async restoreHighlight(tabId, frameId) {
        try {
            let textDirectives = (await browser.tabs.executeScript(tabId, {
                frameId,
                matchAboutBlank: true,
                code: `typeof _helper !== 'undefined' ? _helper.state.textDirectives : null`,
            }))[0];
            if (textDirectives) await findText(textDirectives, tabId, frameId);
        } catch (e) {
            console.warn(e);
        }
    },
};



util.getSettings(null, (o) => {
    if (!o) return;
    for (let k in o) {
        if (k === 'debug') {
            util.debug = o[k];
            continue;
        }
        settings[k] = o[k];
    }
}, true);

if (browser.menus) {

    const MENU_IDS = {
        COPY_LINK: 'copy-link',
        REMOVE_HIGHLIGHT: 'remove-highlight',
        RESTORE_HIGHLIGHT: 'restore-highlight',
    };

    let visibleMenu = {
        [MENU_IDS.REMOVE_HIGHLIGHT]: false,
        [MENU_IDS.RESTORE_HIGHLIGHT]: false,
    };

    browser.menus.create({
        id: MENU_IDS.COPY_LINK,
        title: "Copy Link to Selected Text",
        contexts: ["selection"],
    });

    try {
        browser.menus.create({
            id: MENU_IDS.REMOVE_HIGHLIGHT,
            title: "Remove Highlight",
            contexts: ["page"],
            visible: visibleMenu[MENU_IDS.REMOVE_HIGHLIGHT],
        });

        browser.menus.create({
            id: MENU_IDS.RESTORE_HIGHLIGHT,
            title: "Restore Highlight",
            contexts: ["page"],
            visible: visibleMenu[MENU_IDS.RESTORE_HIGHLIGHT],
        });
    } catch (e) {
        console.warn(e);
    }

    util.addListener(browser.menus.onClicked, async (info, tab) => {
        util.log(info, tab);
        let tabId = tab.id;
        let frameId = info.frameId || 0;
        if (info.menuItemId === MENU_IDS.COPY_LINK) {
            if (!info.pageUrl || !info.selectionText) return;
            let selectionText = info.selectionText.trim();
            if (!selectionText) return;
            await action.copyLink(tabId, frameId, info.frameUrl || info.pageUrl, [{ text: selectionText }]);
        }
        if (info.menuItemId === MENU_IDS.REMOVE_HIGHLIGHT) {
            await action.removeHighlight(tabId, frameId);
        }
        if (info.menuItemId === MENU_IDS.RESTORE_HIGHLIGHT) {
            await action.restoreHighlight(tabId, frameId);
        }
    });

    util.addListener(browser.menus.onShown, async (info, tab) => {
        util.log(info, tab);
        if (!info.contexts.includes('page')) return;
        let tabId = tab.id;
        let frameId = info.frameId || 0;
        let needRefresh = false;
        let visible = false;
        let state = {};
        try {
            state = (await browser.tabs.executeScript(tabId, {
                frameId,
                matchAboutBlank: true,
                code: `typeof _helper !== 'undefined' ? _helper.state : {}`,
            }))[0];
        } catch (e) {
            util.log(e);
        }
        visible = !!state.highlighted;
        if (visibleMenu[MENU_IDS.REMOVE_HIGHLIGHT] != visible) {
            visibleMenu[MENU_IDS.REMOVE_HIGHLIGHT] = visible;
            await browser.menus.update(MENU_IDS.REMOVE_HIGHLIGHT, {
                visible,
            });
            needRefresh = true;
        }
        visible = !state.highlighted && !!state.textDirectives;
        if (visibleMenu[MENU_IDS.RESTORE_HIGHLIGHT] != visible) {
            visibleMenu[MENU_IDS.RESTORE_HIGHLIGHT] = visible;
            await browser.menus.update(MENU_IDS.RESTORE_HIGHLIGHT, {
                visible,
            });
            needRefresh = true;
        }
        if (needRefresh) browser.menus.refresh();
    });

}

if (browser.browserAction) {
    util.addListener(browser.browserAction.onClicked, async (tab, clickData) => {
        util.log(tab, clickData);
        let tabId = tab.id;
        let frameId = 0;
        let url = tab.url;
        try {
            let frames = await browser.webNavigation.getAllFrames({ tabId });
            let hasFocusFrames = {};
            await Promise.all(frames.map(async (frame) => {
                try {
                    if ((await browser.tabs.executeScript(tabId, {
                        frameId: frame.frameId,
                        matchAboutBlank: true,
                        code: 'document.hasFocus()',
                    }))[0]) {
                        hasFocusFrames[frame.parentFrameId] = frame;
                    }
                } catch (e) {
                    util.log(e);
                }
            }));
            util.log(hasFocusFrames);
            if (hasFocusFrames[-1]) {
                let frame = hasFocusFrames[-1];
                while (hasFocusFrames[frame.frameId]) {
                    frame = hasFocusFrames[frame.frameId]
                }
                frameId = frame.frameId;
                util.log(frameId);
                if (frame.url) url = frame.url;
            }
            let ranges = (await loadHelper(tabId, frameId,
                `_helper.getSelectionText(${JSON.stringify(settings.extend_incomplete_word)})`
            )).filter(e => !!e.text.trim());
            if (ranges.length) {
                await action.copyLink(tabId, frameId, url, ranges);
            } else {
                await action.restoreHighlight(tabId, frameId);
            }
        } catch (e) {
            console.warn(e);
        }
    });
}
