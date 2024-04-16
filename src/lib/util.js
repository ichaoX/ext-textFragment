const util = {
    addListener(event, listener, ...extra) {
        if (!event) {
            console.trace('Event does not exist!');
            return;
        }
        event.addListener(listener, ...extra);
        let destroy = () => {
            if (event.hasListener(listener)) {
                event.removeListener(listener);
            }
        };
        this.destroy(destroy);
        return {
            destroy,
        };
    },
    _context: 'global',
    _contexts: {},
    context(context) {
        if (context !== undefined) {
            let _context = this._context;
            this._context = context;
            return _context;
        } else {
            if (!this._contexts[this._context]) this._contexts[this._context] = {};
            return this._contexts[this._context];
        }
    },
    destroy(callback = null) {
        let context = this.context();
        if (!context.destroyList) context.destroyList = [];
        if (callback) {
            context.destroyList.push(callback);
        } else {
            while (callback = context.destroyList.pop()) {
                try {
                    callback();
                } catch (e) {
                    console.warn(e);
                }
            }
        }
        return this;
    },
    _storageArea: self.browser && browser.storage.sync ? 'sync' : 'local',
    _storagePrefix: '',
    _defaultConfig: {
        debug: false,
        auto_disable: true,
        highlight_type: 'auto',
        remove_fragment_directive: false,
        keep_url_hash: true,
        exact_match_limit: 300,
        extend_incomplete_word: true,
    },
    async setSettings(settings, callback) {
        if (!settings || 'object' !== typeof settings) return;
        settings = JSON.parse(JSON.stringify(settings));
        let o = Object.keys(settings).reduce((a, b) => (a[this._storagePrefix + b] = settings[b], a), {});
        await browser.storage[this._storageArea].set(o);
        if (callback) callback(settings);
    },
    getSettings(keys, callback, onChanged) {
        if (!callback) return this.promisify((resolve) => this.getSettings(keys, resolve, onChanged));
        if (!self.browser) return callback(this._defaultConfig);
        if (!keys) keys = Object.keys(this._defaultConfig);
        let storageArea = this._storageArea;
        let prefixLength = this._storagePrefix.length;
        let o = keys.reduce((a, b) => (a[this._storagePrefix + b] = this._defaultConfig[b], a), {});
        browser.storage[storageArea].get(o).then((results) => {
            if (callback) {
                if (prefixLength > 0) results = Object.keys(results).reduce((a, b) => (a[b.slice(prefixLength)] = results[b], a), {});
                callback(results);
            }
        }, (error) => {
            console.error(error)
        });
        if (onChanged === true) onChanged = callback;
        if (!onChanged) return;
        let listener = (changes, area) => {
            if (area && area !== storageArea) return;
            let results;
            for (let key in changes) {
                if (!key.startsWith(this._storagePrefix)) continue;
                let nkey = key.slice(prefixLength);
                if (!keys.includes(nkey)) continue;
                if (!results) results = {};
                results[nkey] = changes[key].newValue;
                if (results[nkey] === undefined) results[nkey] = this._defaultConfig[nkey];
            }
            if (results) onChanged(results);
        };
        return this.addListener(browser.storage[storageArea].onChanged || browser.storage.onChanged, listener);
    },
    promisify(func) {
        return new Promise(async (resolve, reject) => {
            try {
                await func(resolve, reject);
            } catch (e) {
                reject(e);
            }
        });
    },
    debug: false,
    get log() {
        return this.debug ? console.debug.bind(console) : () => null;
    },
};

/*
if ('undefined' !== typeof browser && browser.management) {
    browser.management.getSelf().then(r => util.debug = util.debug || 'development' === r.installType);
}
*/
