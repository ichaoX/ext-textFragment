var _helper = {
    debug: false,
    get log() {
        return this.debug ? console.debug.bind(console) : () => null;
    },
    state: {
        highlighted: false,
        textDirectives: null,
    },
    textNormalize(text) {
        if (!text) return '';
        // FIXME
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
    },
    removeFragmentDirectives() {
        console.info(location.href);
        if (!location.hash) return;
        // XXX
        if (/#.+:~:/.test(location.href)) {
            location.hash = location.hash.replace(/:~:.*$/, '');
        } else {
            history.replaceState(null, '', location.href.replace(/(#.*)(?::~:.*)$/, '$1').replace(/^([^#]+)#$/, '$1'));
        }
    },
    binarySearch(c, r, cr = false) {
        let l = 0;
        if (cr && !c(r)) return -1;
        while (l < r) {
            let m = Math.floor((l + r) / 2);
            if (c(m)) {
                r = m;
            } else {
                l = m + 1;
            }
        }
        return r;
    },
    findRange(pattern, scroll = false, startPattern = null) {
        let regexp = new RegExp(pattern, 'i');
        let regexp0 = startPattern ? new RegExp(startPattern, 'i') : null;
        let s = getSelection();
        let rl = [];
        for (let i = 0; i < s.rangeCount; i++) {
            rl.push(s.getRangeAt(i).cloneRange());
        }
        let container = document.body || document.documentElement;
        let startContainer, startOffset, endContainer, endOffset, endRange;
        let state, endRange1;
        let r = new Range();
        let result = false;
        let test = (input, search) => {
            input = this.textNormalize(input);
            if (typeof search === 'string') {
                return input.includes(this.textNormalize(search));
            } else {
                return search.test(input);
            }
        };
        let findRangeEnd = (node, search) => {
            let i = 0;
            let c = (i) => {
                s.extend(node, i + 1);
                return test(s.toString(), search);
            }
            switch (node.nodeType) {
                case Node.ELEMENT_NODE: {
                    i = this.binarySearch(c, node.childNodes.length - 1, true);
                    if (i === -1) return false;
                    endContainer = node;
                    endOffset = i + 1;
                    node = node.childNodes[i];
                    // this.log(node);
                    return findRangeEnd(node, search);
                }
                case Node.TEXT_NODE: {
                    i = this.binarySearch(c, node.textContent.length - 1);
                    break;
                }
            }
            s.extend(node, i + 1);
            endContainer = node;
            endOffset = i + 1;
            this.log(node, i);
            return true;
        };
        let findRangeStart = (node, search, endRange, trim = false) => {
            s.removeAllRanges();
            s.addRange(endRange);

            let i = 0;
            let text;
            let mismatch = false;
            switch (node.nodeType) {
                case Node.ELEMENT_NODE: {
                    let dec = false;
                    let c = (i, update = false) => {
                        s.extend(node, i);
                        if (endRange.compareBoundaryPoints(Range.END_TO_END, s.getRangeAt(0)) < 0 || !(text = this.textNormalize(s.toString())).trim() || !test(text, search)) {
                            if (update) mismatch = true;
                            return true;
                        } else if ('string' === typeof search && text === this.textNormalize(search)) {
                            // XXX
                            if (update && trim && i > 0) dec = true;
                            return true;
                        } else if (i == node.childNodes.length) {
                            return false;
                        }
                        return false;
                    };
                    i = this.binarySearch(c, node.childNodes.length, true);
                    if (i === -1) return false;
                    c(i, true);
                    if (dec || mismatch) i--;
                    if (i < 0) return false;
                    s.extend(node, i);
                    if (i < node.childNodes.length) {
                        if (!trim) {
                            startContainer = node;
                            startOffset = i;
                        }
                        node = node.childNodes[i];
                        // this.log(node);
                        return findRangeStart(node, search, endRange, trim);
                    }
                    break;
                }
                case Node.TEXT_NODE: {
                    let c = (i, update = false) => {
                        s.extend(node, i);
                        if (endRange.compareBoundaryPoints(Range.END_TO_END, s.getRangeAt(0)) < 0 || !(text = this.textNormalize(s.toString())).trim() || !test(text, search)) {
                            if (update) mismatch = true;
                            return true;
                        }
                        if ('string' === typeof search && text === search) return true;
                        return false;
                    };
                    i = this.binarySearch(c, node.textContent.length);
                    c(i, true);
                    if (mismatch) {
                        // XXX
                        let hasWhiteSpace = false;
                        if (trim && 'string' === typeof search && this.textNormalize(s.toString()).trim() === search.trim()) hasWhiteSpace = true;
                        i--;
                        if (i < 0) return false;
                        s.extend(node, i);
                        if (hasWhiteSpace && this.textNormalize(s.toString()).trim() !== search.trim()) {
                            i++;
                            s.extend(node, i);
                        }
                    }
                    break;
                }
            }
            if (!trim) {
                startContainer = node;
                startOffset = i;
            } else {
                endContainer = node;
                endOffset = i;
            }
            this.log(node, i);
            return true;
        };
        let removeContext = (text, suffix = "") => {
            if (suffix) {
                s.removeAllRanges();
                r.setStart(endContainer, endOffset);
                r.setEnd(endContainer, endOffset);
                r.collapse(false);
                endRange = r.cloneRange();
                s.addRange(r.cloneRange());
                // this.log(JSON.stringify(suffix));
                if (!findRangeStart(container, suffix, endRange, true)) {
                    return false;
                }
                console.assert(this.textNormalize(s.toString()).trim() === this.textNormalize(suffix).trim(), `suffix ${JSON.stringify(suffix)} ${JSON.stringify(s.toString())}`);
            }
            s.removeAllRanges();
            r.setStart(endContainer, endOffset);
            r.setEnd(endContainer, endOffset);
            r.collapse(false);
            endRange = r.cloneRange();
            s.addRange(r.cloneRange());
            // this.log(JSON.stringify(text));
            if (!findRangeStart(container, text, endRange)) {
                return false;
            }
            console.assert(this.textNormalize(s.toString()) === this.textNormalize(text), `text ${JSON.stringify(text)} ${JSON.stringify(s.toString())}`);
            return true;
        };
        document.documentElement.classList.add('ext-text-fragment--selectable');
        try {
            s.removeAllRanges();
            r.selectNode(container);
            s.addRange(r.cloneRange());
            if (!test(s.toString(), regexp)) return result;
            s.collapseToStart();
            if (regexp0) {
                if (!findRangeEnd(container, regexp0)) return result;
                r.setStart(endContainer, endOffset);
                r.setEnd(endContainer, endOffset);
                r.collapse(false);
                endRange1 = r.cloneRange();
            }
            if (findRangeEnd(container, regexp)) {
                s.collapseToEnd();

                r.setStart(endContainer, endOffset);
                r.setEnd(endContainer, endOffset);
                r.collapse(false);
                endRange = r.cloneRange();

                if (regexp0) {
                    state = findRangeStart(container, regexp0, endRange1);
                    s.collapseToStart();
                    s.extend(endContainer, endOffset);
                }else{
                    state = findRangeStart(container, regexp, endRange);
                }

                if (state) {
                    result = true;
                    let details = regexp.exec(this.textNormalize(s.toString()));
                    console.assert(!!details, `context ${regexp} ${JSON.stringify(s.toString())}`);
                    if (details && details[details.length == 4 ? 2 : 0] != details.input) {
                        let useGroup = details.length == 4;
                        let text = details[useGroup ? 2 : 0];
                        let index = details.index + (useGroup ? details[1].length : 0);
                        let prefix = details.input.slice(0, index);
                        let suffix = details.input.slice(index + text.length);
                        if (!removeContext(text, suffix)) {
                            this.log('removeContext Failed', text, suffix);
                        }
                    }
                }
            }
            return result;
        } finally {
            s.removeAllRanges();
            document.documentElement.classList.remove('ext-text-fragment--selectable');
            for (let i of rl) {
                s.addRange(i);
            }
            if (result) {
                r.setStart(startContainer, startOffset);
                r.setEnd(endContainer, endOffset);
                s.addRange(r.cloneRange());
                this.log(r.cloneRange());
                if (scroll) this.scrollIntoView(startContainer, r);
            }
        }
    },
    scrollIntoView(node, range = null) {
        if (node.nodeType != Node.ELEMENT_NODE) {
            node = node.previousElementSibling || node.parentElement;
        }
        if (node) {
            try {
                node.scrollIntoView({
                    block: 'center',
                });
            } catch (e) {
                node.scrollIntoView();
            }
            let rRect;
            if (range && (rRect = range.getBoundingClientRect()) && (rRect.top < 0 || rRect.top > window.innerHeight)) {
                this.log(rRect);
                window.scrollBy({ top: Math.round(rRect.top - window.innerHeight / 2) });
            }
        }
    },
    getSelectionText(extend) {
        let s = getSelection();
        let t = [];
        if (s.isCollapsed && document.activeElement && 'function' === typeof document.activeElement.setSelectionRange) {
            // XXX mutli range
            try {
                let e = document.activeElement;
                if (e.selectionStart < e.selectionEnd) {
                    t.push({
                        text: e.value.slice(e.selectionStart, e.selectionEnd),
                        prefix: e.value.slice(0, e.selectionStart),
                        suffix: e.value.slice(e.selectionEnd),
                    });
                }
            } catch (e) {
                console.warn(e);
            }
        } else {
            let rl = [];
            for (let i = 0; i < s.rangeCount; i++) {
                rl.push(s.getRangeAt(i).cloneRange());
            }
            s.removeAllRanges();
            // check continuous range
            for (let i of rl) {
                if (i.collapsed) continue;
                i = i.cloneRange();
                let c0 = s.rangeCount;
                if (c0 > 0 && s.modify) {
                    try {
                        s.modify('extend', 'left', 'character');
                        s.modify('extend', 'right', 'character');
                        s.modify('extend', 'right', 'character');
                    } catch (e) {
                        console.warn(e)
                    }
                }
                if (s.rangeCount > c0 && s.getRangeAt(c0).compareBoundaryPoints(Range.START_TO_START, i) === 0) {
                    s.addRange(i);
                    let ref = t[t.length - 1];
                    ref.text = s.toString();
                    ref.ranges.push(i.cloneRange());
                } else {
                    s.removeAllRanges();
                    s.addRange(i);
                    t.push({
                        text: s.toString(),
                        ranges: [i.cloneRange()],
                    });
                }
            }
            // XXX
            document.documentElement.classList.add('ext-text-fragment--selectable');
            for (let i of t) {
                let ranges = i.ranges;
                delete i.ranges;
                let startRange = ranges[0];
                let endRange = ranges[ranges.length - 1];
                if (extend && s.modify) {
                    s.removeAllRanges();
                    s.addRange(startRange.cloneRange());
                    s.collapseToStart();
                    s.extend(endRange.endContainer, endRange.endOffset);
                    i.text0 = s.toString();

                    let boundedRegExp;
                    try {
                        boundedRegExp = new RegExp('[\\s\\p{P}\\p{S}]', 'u');
                    } catch (e) {
                        _helper.log(e);
                        boundedRegExp = new RegExp(`[\\s,.:;!?(){}\\[\\]\\-…\\\\|/"'~_=%+*，。：；！？（）{}【】—…、《》“”‘’／]`, 'u');
                    }
                    try {
                        s.removeAllRanges();
                        s.addRange(endRange.cloneRange());
                        s.collapseToEnd();
                        s.modify('extend', 'left', 'word');
                        s.modify('extend', 'right', 'word');
                        if (s.rangeCount > 0 && s.getRangeAt(s.rangeCount - 1).compareBoundaryPoints(Range.END_TO_END, endRange) > 0) {
                            let text = s.toString();
                            if (!boundedRegExp.test(text)) {
                                endRange = s.getRangeAt(s.rangeCount - 1).cloneRange();
                            } else {
                                s.removeAllRanges();
                                s.addRange(endRange.cloneRange());
                                s.collapseToEnd();
                                s.modify('extend', 'left', 'character');
                                s.modify('extend', 'right', 'character');
                                let limit = text.length;
                                while (limit-- > 0) {
                                    s.modify('extend', 'right', 'character');
                                    if (boundedRegExp.test(s.toString())) {
                                        s.modify('extend', 'left', 'character');
                                        if (s.toString().trim()) endRange = s.getRangeAt(s.rangeCount - 1).cloneRange();
                                        break;
                                    }
                                }
                            }
                        }
                        i.extend_right = s.toString();
                        s.removeAllRanges();
                        s.addRange(startRange.cloneRange());
                        s.collapseToStart();
                        s.modify('extend', 'right', 'word');
                        s.modify('extend', 'left', 'word');
                        if (s.rangeCount > 0 && s.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, startRange) < 0) {
                            let text = s.toString();
                            if (!boundedRegExp.test(text)) {
                                startRange = s.getRangeAt(0).cloneRange();
                            } else {
                                s.removeAllRanges();
                                s.addRange(startRange.cloneRange());
                                s.collapseToStart();
                                s.modify('extend', 'right', 'character');
                                s.modify('extend', 'left', 'character');
                                let limit = text.length;
                                while (limit-- > 0) {
                                    s.modify('extend', 'left', 'character');
                                    if (boundedRegExp.test(s.toString())) {
                                        s.modify('extend', 'right', 'character');
                                        if (s.toString().trim()) startRange = s.getRangeAt(0).cloneRange();
                                        break;
                                    }
                                }
                            }
                        }
                        i.extend_left = s.toString();
                    } catch (e) {
                        console.warn(e);
                    }
                }
                // fix user-select
                s.removeAllRanges();
                s.addRange(startRange.cloneRange());
                s.collapseToStart();
                s.extend(endRange.endContainer, endRange.endOffset);
                i.text = s.toString();

                // XXX
                let container = document.body || document.documentElement;
                s.removeAllRanges();
                s.addRange(startRange.cloneRange());
                s.collapseToStart();
                s.extend(container, 0);
                i.prefix = s.toString();

                s.removeAllRanges();
                s.addRange(endRange.cloneRange());
                s.collapseToEnd();
                s.extend(container, container.childNodes.length);
                i.suffix = s.toString();
            }
            document.documentElement.classList.remove('ext-text-fragment--selectable');
            s.removeAllRanges();
            for (let i of rl) {
                s.addRange(i);
            }
        }
        return t;
    },
};

true;
