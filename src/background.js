// console.log('background start');

let settings = {};

let isNativeSupported = !!document.fragmentDirective;

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
            let fullText, startText, contextPattern, startPattern, hasContext = false;
            let match = text.match(/^(?:([^,]+)-,)?([^,]+)(?:,([^,-][^,]*))?(?:,-([^,]+))?$/);
            if (match) {
                let [_, prefix, start, end, suffix] = match;
                startText = decodeURIComponent(start);
                if (prefix === undefined && end === undefined && suffix === undefined) {
                    fullText = startText;
                } else {
                    let pattern = regExpQuote(startText);
                    let prefixPattern = prefix ? `(${regExpQuote(decodeURIComponent(prefix))}\\s*)` : '()';
                    if (end) {
                        startPattern = prefixPattern + pattern;
                        pattern += `[^]*?${regExpQuote(decodeURIComponent(end))}`;
                    }
                    contextPattern = prefixPattern
                        + `(${pattern})`
                        + (suffix ? `(\\s*${regExpQuote(decodeURIComponent(suffix))})` : '()');
                    hasContext = prefix || suffix;
                    util.log(JSON.stringify(contextPattern));
                }
            } else {
                fullText = startText = decodeURIComponent(text);
            }
            result.push({
                fullText,
                startText,
                contextPattern,
                startPattern,
                hasContext,
            });
        } catch (e) {
            console.warn(e);
        }
    }
    return result;
};

let wordSegmenter = {
    map: new Map(),
    hasIntlSegmenter() {
        return self.Intl && self.Intl.Segmenter;
    },
    async getLangOpts(context) {
        let options = {
            isWordSeparatedBySpace: /^[\x00-\x7F]*$/.test(context.text),
            language: null,
        };
        if (!options.isWordSeparatedBySpace) {
            let detectingLanguages = await browser.i18n.detectLanguage(context.text);
            if (!(detectingLanguages.isReliable && detectingLanguages.languages[0]) && (context.prefix || context.suffix)) {
                detectingLanguages = await browser.i18n.detectLanguage(`${context.prefix}${context.text}${context.suffix}`);
            }
            util.log(detectingLanguages);
            if (detectingLanguages.isReliable && detectingLanguages.languages[0]) {
                options.language = detectingLanguages.languages[0].language.replace(/[\-_].*$/, '');
                options.isWordSeparatedBySpace = 'en|fr|de|it|es|pt|sv|no|da|nl|hu|cs|sk|hr|sr|sl|pl|bg|ro'.split('|').includes(options.language);
            }
        }
        return options;
    },
    get(locales) {
        let s = this.map.get(locales);
        if (!s && this.hasIntlSegmenter()) {
            s = new Intl.Segmenter(locales, { granularity: "word" });
            this.map.set(locales, s);
        }
        return s;
    },
    isWordLike(i) {
        if (i.isWordLike) return true;
        // fix: https://bugzilla.mozilla.org/show_bug.cgi?id=1891736
        return !(new RegExp(`^${boundedPattern}+$`, 'u')).test(i.segment);
    },
    async create(context) {
        let options = await this.getLangOpts(context);
        let o = Object.create(this);
        o.options = options;
        return o;
    },
    normalize(context0, langOpts = null) {
        langOpts = langOpts || this.options || {};
        let context = JSON.parse(JSON.stringify(context0));
        if (!context.prefix) context.prefix = '';
        if (!context.suffix) context.suffix = '';
        if (context.text0 && context.text0.length < context.text.length && langOpts.language && this.hasIntlSegmenter()) {
            util.log(context);
            if (!context.extend_left) context.extend_left = '';
            if (!context.extend_right) context.extend_right = '';
            try {
                if (context.text != context.extend_left + context.text0 + context.extend_right) {
                    throw 'Assertion failed';
                }
                let segments = this.get(langOpts.language).segment(context.text);
                let context1 = {
                    text: '',
                    prefix: '',
                    suffix: '',
                };
                let length0 = context.extend_left.length;
                let length1 = 0;
                let type = 'prefix';
                for (let i of segments) {
                    let t = i.segment;
                    if (type === 'prefix') {
                        if (length1 + t.length > length0) {
                            length0 += context.text0.length;
                            type = 'text';
                        }
                    } else if (type === 'text') {
                        if (length1 >= length0) type = 'suffix';
                    }
                    context1[type] += t;
                    length1 += t.length;
                }
                context.text = context1.text;
                context.prefix += context1.prefix;
                context.suffix = context1.suffix + context.suffix;
                delete context.text0;
                delete context.extend_left;
                delete context.extend_right;
            } catch (e) {
                util.log(e);
            }
        }
        context.text = context.text.trim().replace(/\r?\n\r?/g, "\n");
        return context;
    },
    count(fullText, langOpts = null) {
        if (!fullText) return 0;
        langOpts = langOpts || this.options || {};
        let wordCount = langOpts.isWordSeparatedBySpace ? fullText.split(/\s+/).length : fullText.length;
        if (langOpts.language && this.hasIntlSegmenter()) {
            try {
                let segments = this.get(langOpts.language).segment(fullText);
                wordCount = [...segments].filter(i => this.isWordLike(i)).length;
            } catch (e) {
                util.log(e);
            }
        }
        return wordCount;
    },
    short(fullText, reverse = false, n = 3, langOpts = null) {
        if (!fullText) return '';
        langOpts = langOpts || this.options || {};
        let text = fullText.replace(new RegExp(
            reverse
                ? (langOpts.isWordSeparatedBySpace ? `(?:^[^]*?\\s)(\\S+(\\s+\\S+){${n - 1}}$)` : `(?:^[^]*${boundedPattern})(\\S[^]*?$)`)
                : (langOpts.isWordSeparatedBySpace ? `(^\\S+(\\s+\\S+){${n - 1}})(?:\\s[^]*?)$` : `(^[^]*?\\S)(?:${boundedPattern}[^]*)$`)
            , 'u'), '$1'
        );
        if (langOpts.language && this.hasIntlSegmenter()) {
            try {
                let segments = this.get(langOpts.language).segment(fullText);
                let s = [...segments];
                if (reverse) s = s.reverse();
                text = '';
                for (let index = 0, wordCount = 0; index < s.length && wordCount < n; index++) {
                    let i = s[index];
                    if (reverse) {
                        text = i.segment + text;
                    } else {
                        text += i.segment;
                    }
                    if (this.isWordLike(i)) wordCount++;
                }
            } catch (e) {
                util.log(e);
            }
        }
        return text.trim();
    },
};

let buildTextDirective = async (context, innerText = null) => {
    let segmenter = await wordSegmenter.create(context);
    context = segmenter.normalize(context);
    let fullText = context.text;
    let textDirective;
    let pattern;
    if (/[\r\n\t]/.test(fullText) || fullText.length >= settings.exact_match_limit) {
        let n = Math.max(1, settings.range_match_word_count);
        let startText = segmenter.short(fullText.replace(/[\r\n\t][^]*$/, ''), false, n);
        let endText = segmenter.short(fullText.replace(/^[^]*[\n\r\t]/, ''), true, n);
        if (startText.length + endText.length < fullText.length) {
            textDirective = `${encodeTextDirectiveString(startText)},${encodeTextDirectiveString(endText)}`;
            pattern = `${regExpQuote(startText)}[^]*?${regExpQuote(endText)}`;
        }
    }
    if (!textDirective) {
        textDirective = encodeTextDirectiveString(fullText);
        pattern = regExpQuote(fullText);
    }
    if (context.prefix || context.suffix) {
        let useContext = segmenter.count(fullText) <= 3;
        if (!useContext && innerText && pattern) {
            let match = innerText.match(new RegExp(pattern, 'ig'));
            util.log(match);
            // XXX
            if (match && (match.length > 1 || match[0].replace(/\s+/g, ' ').toLowerCase() != fullText.replace(/\s+/g, ' ').toLowerCase())) useContext = true;
        }
        if (useContext) {
            let n = Math.max(1, settings.context_word_count);
            let prefix = context.prefix.trim().replace(/\r?\n\r?/g, "\n").replace(/^[^]*[\n\r\t]/, '').trim();
            let suffix = context.suffix.trim().replace(/\r?\n\r?/g, "\n").replace(/[\r\n\t][^]*$/, '').trim();
            prefix = segmenter.short(prefix, true, n);
            suffix = segmenter.short(suffix, false, n);
            if (suffix) textDirective += `,-${encodeTextDirectiveString(suffix)}`;
            if (prefix) textDirective = `${encodeTextDirectiveString(prefix)}-,${textDirective}`;
        }
    }
    return textDirective;
};

let textNormalize = (text) => {
    if (!text) return '';
    // FIXME
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

let regExpQuote = (str, normalize = true) => {
    let chars = '.\\+*?[^]$(){}=!<>|:-#';
    if (normalize) str = textNormalize(str);
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
    for (let char of text) {
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

let webExtFind = async (text, options = {}) => {
    let result;
    result = await browser.find.find(text, options);
    if (result.count == 0) {
        // XXX
        let compositionText = text.normalize('NFC');
        if (compositionText != text) {
            util.log('try NFC', compositionText);
            result = await browser.find.find(compositionText, options);
        }
    }
    return result;
};

let findText = async (textDirectives, tabId, frameId = 0, retry = 0, autoScroll = true) => {
    let textDirectiveDetails = parseTextDirectives(textDirectives);
    if (!textDirectiveDetails.length) return false;
    util.log(textDirectiveDetails);
    const isAutoMode = settings.highlight_type === 'auto';
    let useSelection = settings.highlight_type === 'selection' || !browser.find;
    let findRange = async (pattern, scroll = false, startPattern = null) => {
        if (!autoScroll) scroll = false;
        let args = [pattern, scroll, startPattern];
        return await loadHelper(tabId, frameId,
            `_helper.findRange(...${JSON.stringify(args)})`
        );
    };
    try {
        let innerText = null;
        let r = false;
        for (let detail of textDirectiveDetails) {
            let fullText = detail.fullText, startText = detail.startText, contextRegExp;
            let rangeIndex = 0, highlightAll = true, result = false, rangeIndexText;
            // XXX
            let fixSubSearch = async (searchString = null) => {
                if (!contextRegExp) return false;
                if (innerText === null) innerText = textNormalize(await getInnerText(tabId, frameId));
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
                        rangeIndexText = textNormalize(searchString);
                        util.log(rangeIndexText, rangeIndex);
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
            if (useSelection || /[\n\t]/.test(fullText) || detail.hasContext || r) {
                if (isAutoMode && !useSelection) useSelection = true;
                browser.tabs.executeScript(tabId, {
                    frameId,
                    matchAboutBlank: true,
                    code: `console.info(${JSON.stringify(fullText)})`,
                });
            }
            if (useSelection) {
                if (result = await findRange(detail.contextPattern || regExpQuote(detail.fullText || startText), !r, detail.startPattern)) {
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
            if (/[\n\t]/.test(fullText)) {
                if (!contextRegExp) contextRegExp = new RegExp(regExpQuote(fullText), 'ig');
                fullText = fullText.trim().replace(/[\n\t][^]*$/, '').trim();
                await fixSubSearch(fullText);
            }
            result = await webExtFind(fullText, {
                tabId,
                caseSensitive: false,
                includeRangeData: true,
            });
            if (result.count == 0 && retry == 0 && startText) {
                rangeIndex = 0;
                highlightAll = true;
                result = await webExtFind(startText, {
                    tabId,
                    caseSensitive: false,
                    includeRangeData: true,
                })
            }
            util.log(result);
            if (result.count > 0) {
                if (result.rangeData && rangeIndexText) {
                    console.assert(result.count == result.rangeData.length, result);
                    for (let i = 0; i < Math.min(rangeIndex + 1, result.rangeData.length); i++) {
                        if (textNormalize(result.rangeData[i].text) != rangeIndexText) {
                            rangeIndex++;
                        }
                    }
                    util.log(rangeIndex);
                }
                if (rangeIndex >= result.count) {
                    util.log('Assertion failed: rangeIndex=', rangeIndex);
                    rangeIndex = 0;
                }
                // scroll into frist
                await browser.find.highlightResults({
                    tabId,
                    rangeIndex,
                    noScroll: !autoScroll,
                });
                // highlight all
                if (highlightAll && result.count > 1 && rangeIndex == 0) {
                    // FIX: https://bugzilla.mozilla.org/show_bug.cgi?id=1918589
                    if (autoScroll) await new Promise(t => setTimeout(t, 500));
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
        return await findText(textDirectives, tabId, frameId, retry, autoScroll);
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

let getState = async (tabId, frameId) => {
    let state = false;
    try {
        state = (await browser.tabs.executeScript(tabId, {
            frameId,
            matchAboutBlank: true,
            code: `typeof _helper !== 'undefined' ? _helper.state : {}`,
        }))[0];
    } catch (e) {
        util.log(e);
    }
    return state || {};
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

let copyToClipboard = async (text, html) => {
    if (navigator.clipboard && text) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (e) {
            console.warn(e);
        }
    }

    function oncopy(event) {
        document.removeEventListener("copy", oncopy, true);
        // Hide the event from the page to prevent tampering.
        event.stopImmediatePropagation();
        // Overwrite the clipboard content.
        event.preventDefault();
        if (text !== undefined) event.clipboardData.setData("text/plain", text);
        if (html !== undefined) event.clipboardData.setData("text/html", html);
    }
    // XXX: dom.event.clipboardevents.enabled = true
    document.addEventListener("copy", oncopy, true);
    try {
        // Requires the clipboardWrite permission, or a user gesture:
        document.execCommand("copy");
    } catch (e) {
        console.warn(e);
    }
};

let mutex = {};

let listener = async (details, isLoad = false) => {
    // XXX
    if (settings.auto_disable && isNativeSupported) return;
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
            return;
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
        let autoScroll = true;
        if (!isLoad) {
            let state = await getState(tabId, frameId);
            autoScroll = JSON.stringify(state.textDirectives || []) != JSON.stringify(textDirectives);
        }
        await findText(textDirectives, tabId, frameId, 5, autoScroll);
    } catch (e) {
        console.warn(e);
    } finally {
        if (mKey) delete mutex[mKey];
    }
};

let onLoaded = (details) => listener(details, true);
let onUpdated = (details) => listener(details, false);

util.addListener(browser.webNavigation.onDOMContentLoaded, onLoaded);
// fix: https://bugzilla.mozilla.org/show_bug.cgi?id=1914978
util.addListener(browser.webNavigation.onCompleted, onLoaded);
util.addListener(browser.webNavigation.onReferenceFragmentUpdated, onUpdated);
util.addListener(browser.webNavigation.onHistoryStateUpdated, onUpdated);

let action = {
    async copyLink(target, url, ranges = []) {
        let { tabId, frameId } = target || {};
        try {
            if (!target) throw 'no target';
            let r = (await loadHelper(tabId, frameId,
                `_helper.getSelectionText(${JSON.stringify(settings.extend_incomplete_word)})`
            )).filter(e => !!e.text.trim());
            if (r.length > 0) ranges = r;
        } catch (e) {
            console.warn(e);
        }
        util.log(ranges);
        let directives = [];
        let innerText = !target ? '' : textNormalize(await getInnerText(tabId, frameId));
        for (let range of ranges) {
            directives.push(`text=${await buildTextDirective(range, innerText)}`);
        }
        // XXX
        if (url === 'about:blank' && target && frameId != 0) {
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
        await copyToClipboard(href);
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
            let state = await getState(tabId, frameId);
            let textDirectives = state.textDirectives;
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
        COPY_FRAME_LINK: 'copy-frame-link',
        REMOVE_HIGHLIGHT: 'remove-highlight',
        RESTORE_HIGHLIGHT: 'restore-highlight',
    };

    let visibleMenu = {
        [MENU_IDS.COPY_LINK]: true,
        [MENU_IDS.COPY_FRAME_LINK]: false,
        [MENU_IDS.REMOVE_HIGHLIGHT]: false,
        [MENU_IDS.RESTORE_HIGHLIGHT]: false,
    };

    browser.menus.create({
        id: MENU_IDS.COPY_LINK,
        title: browser.i18n.getMessage("menu_copy_link"),
        contexts: ["selection"],
        // visible: visibleMenu[MENU_IDS.COPY_LINK],
    });

    try {
        browser.menus.create({
            id: MENU_IDS.COPY_FRAME_LINK,
            title: browser.i18n.getMessage("menu_copy_frame_link"),
            contexts: ["selection"],
            visible: visibleMenu[MENU_IDS.COPY_FRAME_LINK],
        });

        browser.menus.create({
            id: MENU_IDS.REMOVE_HIGHLIGHT,
            title: browser.i18n.getMessage("menu_remove_highlight"),
            contexts: ["page"],
            visible: visibleMenu[MENU_IDS.REMOVE_HIGHLIGHT],
        });

        browser.menus.create({
            id: MENU_IDS.RESTORE_HIGHLIGHT,
            title: browser.i18n.getMessage("menu_restore_highlight"),
            contexts: ["page"],
            visible: visibleMenu[MENU_IDS.RESTORE_HIGHLIGHT],
        });
    } catch (e) {
        console.warn(e);
    }

    util.addListener(browser.menus.onClicked, async (info, tab) => {
        util.log(info, tab);
        let tabId = tab ? tab.id : null;
        let frameId = info.frameId || 0;
        let target = tab ? { tabId, frameId } : null;
        if ([MENU_IDS.COPY_LINK, MENU_IDS.COPY_FRAME_LINK].includes(info.menuItemId)) {
            if (!info.pageUrl || !info.selectionText) return;
            let selectionText = info.selectionText.trim();
            if (!selectionText) return;
            await action.copyLink(target, info.frameUrl || info.pageUrl, [{ text: selectionText }]);
        }
        if (info.menuItemId === MENU_IDS.REMOVE_HIGHLIGHT && tabId !== null) {
            await action.removeHighlight(tabId, frameId);
        }
        if (info.menuItemId === MENU_IDS.RESTORE_HIGHLIGHT && tabId !== null) {
            await action.restoreHighlight(tabId, frameId);
        }
    });

    util.addListener(browser.menus.onShown, async (info, tab) => {
        util.log(info, tab);
        let tabId = tab ? tab.id : null;
        let frameId = info.frameId || 0;
        let needRefresh = false;
        let visible = false;
        if (info.contexts.includes('selection')) {
            let isFrame = info.contexts.includes('frame');
            visible = !isFrame;
            if (visibleMenu[MENU_IDS.COPY_LINK] != visible) {
                visibleMenu[MENU_IDS.COPY_LINK] = visible;
                await browser.menus.update(MENU_IDS.COPY_LINK, {
                    visible,
                });
                needRefresh = true;
            }
            visible = isFrame;
            if (visibleMenu[MENU_IDS.COPY_FRAME_LINK] != visible) {
                visibleMenu[MENU_IDS.COPY_FRAME_LINK] = visible;
                await browser.menus.update(MENU_IDS.COPY_FRAME_LINK, {
                    visible,
                });
                needRefresh = true;
            }
        }
        if (info.contexts.includes('page') && tabId !== null) {
            let state = await getState(tabId, frameId);
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
                await action.copyLink({ tabId, frameId }, url, ranges);
            } else {
                await action.restoreHighlight(tabId, frameId);
            }
        } catch (e) {
            console.warn(e);
        }
    });
}
