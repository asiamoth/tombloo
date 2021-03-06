/**
 * Poster.Bookmark.Pot.Assort - Tombloo patches
 *
 * Postersに「Bookmark」と「Audio」を追加するパッチ
 *
 * 機能:
 * --------------------------------------------------------------------------
 * [Poster Bookmark Pot Assort patch]
 *
 * - Postersに「Bookmark」と「Audio」を追加
 * - 設定ダイアログ内にチェック可能な「Bookmark」と「Audio」を追加
 * - Audioのリブログとmp3リンクからのポストを実装
 * - Audioのローカル保存を実装
 * - ブックマーク用のPOSTダイアログを追加
 * - はてなブックマーク、GoogleBookmarksなど主なサービス対応
 * - 主なブックマークエラーを修正および改善
 * - POSTダイアログのコンテキストメニューを拡張
 * - Quoteしたテキストの「HTML」と「PlainText」を切り替え表示できる項目追加
 * - POSTダイアログが表示されたとき画像が小さいままになる状態を修正
 * - POSTダイアログが半分消えてる状態になって現れた場合のフィックス
 * - タグ補完時に左右キー「←→」で補完窓を閉じられるよう改善
 * - POST時にタグ名をユニークにして重複防止
 * - タグ名の大文字小文字をユーザー側優先で扱うよう改善(おすすめタグなど)
 * - ブックマーク時に文字数オーバーでエラーになるのを自動で調整カット
 * - ブックマーク済みかどうかを明確にわかるよう改善
 * - タグ付け補助用のキーワード抽出などをメニューに追加
 * - パッチのバージョン確認と自動アップデート機能を実装
 * - メニューからクリックするだけでパッチのアンインストールが可能
 *
 * --------------------------------------------------------------------------
 *
 * @version  1.19
 * @date     2011-06-16
 * @author   polygon planet <polygon.planet@gmail.com>
 *            - Blog: http://polygon-planet.blogspot.com/
 *            - Twitter: http://twitter.com/polygon_planet
 *            - Tumblr: http://polygonplanet.tumblr.com/
 * @license  Same as Tombloo
 *
 * Tombloo: https://github.com/to/tombloo/wiki
 */
//-----------------------------------------------------------------------------
(function(undefined) {
//-----------------------------------------------------------------------------
// デバッグ用
//-----------------------------------------------------------------------------
//setPref('debug', true);

//-----------------------------------------------------------------------------
// Constants
//-----------------------------------------------------------------------------
/**
 * ブックマークのタイトル, タグ, コメントの最大文字数 or バイト数
 * 規定を超えるとエラーになりPOST失敗するものがあるので回避用
 *
 * @const  {Object}
 */
const MAX_LENGTH = {
    Tumblr: {},
    Local: {},
    Evernote: {},
    LivedoorClip: {},
    FirefoxBookmark: {},
    
    // 短くしないとラベルが多い場合消える or POSTできない
    // GoogleBookmarksは不明な点が多すぎだよ...
    // (調査したのは日本語版だけだった、英語版は制限も違うかも)
    //TODO: 英語版の最大文字数
    GoogleBookmarks: {
        title     : 250,
        tagLength : 60,
        tagCount  : 35,
        comment   : 140,
        unit      : 'byte'
    },
    // Notesが最大数超えるとエラーでPOSTできない (Unicode文字単位) default: 1000文字
    Delicious: {
        title     : 250, // Title must be less than 255 characters in length
        tagLength : 64,
        tagCount  : 48, // A maximum of 50 tags are allowed
        comment   : 960,
        unit      : 'uni'
    },
    // http://help.yahoo.co.jp/help/jp/bookmarks/bookmarks-04.html
    // 超えるとエラーでPOSTできない (Byte数)
    YahooBookmarks: {
        title     : 250,
        tagLength : 56,
        tagCount  : 15,
        comment   : 920,
        unit      : 'byte'
    },
    // http://b.hatena.ne.jp/help/tag
    // 自動でカットされるけど長すぎるとエラーかも
    HatenaBookmark: {
        title     : null, // タイトルは使わない
        tagLength : 32,
        tagCount  : 10,
        comment   : 290,
        unit      : 'byte'
    }
};

//
// Yahoo!形態素解析API
//
// リクエスト文字列の最大サイズ(Bytes)
//
const YAHOO_API_PARSE_MAX_TEXT_SIZE = 1024 * 80; // 80KB

// 1アプリケーションのリクエスト最大回数
// http://developer.yahoo.co.jp/appendix/rate.html
//
const YAHOO_API_PARSE_MAX_COUNT = 50000;

//
// Yahoo!キーワード抽出API
//
// リクエスト文字列の最大サイズ(Bytes)
//
const YAHOO_API_KEYWORD_MAX_TEXT_SIZE = 1024 * 9; // 9KB

// 1アプリケーションのリクエスト最大回数
// http://developer.yahoo.co.jp/appendix/rate.html
//
const YAHOO_API_KEYWORD_MAX_COUNT = 50000;

// setPref/getPref で使うキー名
//
// 状態を保存/キャッシュする
//
// 接頭語を patches にしておく (その先頭に 'extensions.tombloo.' が付く)
// 他のパッチと同じにならないようidをつけとく
//
const POT_PREF_KEY_PREFIX = 'patches.polygonplanet.extension.posters.bookmark.';

// ブックマークのショートカットキー
const POT_SHORTCUTKEY_BOOKMARK   = 'shortcutkey.quickPost.bookmark';

// 自動で付加するタグ (ラベル)
const POT_AUTO_APPEND_TAGS       = 'autoAppendTags';

// ブックマークをプライベート(非公開)にするかどうか
// (パラメータで指定可能なサービスのみ) YahooBookmarks, Delicious etc.
const POT_BOOKMARK_PRIVATE       = 'bookmarkPrivate';

// メディアファイル(Photo/Audio)をホスト名でフォルダ分けして保存する
const POT_SEPARATE_USER_DATA_FOLDERS = 'separateUserDataFolders';

//
// 先頭のコメント全てを取り込むのに必要なサイズ (internal only)
const POT_SCRIPT_DOCCOMMENT_SIZE = 1024 * 5;

//-----------------------------------------------------------------------------
// 独自拡張用オブジェクト/ライブラリ
//-----------------------------------------------------------------------------
var Pot = {
    // 必ずパッチのバージョンと同じにする
    VERSION: '1.19',
    SYSTEM: 'Tombloo',
    lang: (function(n) {
        return ((n && n.language || n.userLanguage || n.browserLanguage ||
               n.systemLanguage) || 'en').split('-').shift().toLowerCase();
    })(navigator),
    os: (function(n) {
        let r = {}, pf = 'platform', ua = 'userAgent', os;
        [
            { r: /iphone/i,     s: 'iphone',     p: pf },
            { r: /ipod/i,       s: 'ipod',       p: pf },
            { r: /ipad/i,       s: 'ipad',       p: ua },
            { r: /blackberry/i, s: 'blackberry', p: ua },
            { r: /android/i,    s: 'android',    p: ua },
            { r: /mac/i,        s: 'mac',        p: pf },
            { r: /win/i,        s: 'win',        p: pf },
            { r: /x11|linux/i,  s: 'linux',      p: pf }
        ].forEach(function(o) {
            r[o.s] = o.r.test(n[o.p]);
        });
        r.androidtablet = r.android && !/mobile/i.test(n[ua]);
        r.tablet = r.ipad || r.androidtablet;
        if (typeof AppInfo !== 'undefined') {
            switch (String(AppInfo && AppInfo.OS).toLowerCase()) {
                case 'winnt':
                    r.win = true;
                    break;
                case 'linux':
                    r.linux = true;
                    break;
                case 'darwin':
                    r.mac = true;
                    break;
                default:
                    break;
            }
        }
        return r;
    })(navigator),
    tmp: {}
};

// イテレータの外側で参照
var StopIteration = (function(o) {
    var defined;
    try {
        if (typeof StopIteration !== 'undefined') {
            [1].forEach(function() {
                try {
                    throw StopIteration;
                } catch (e) {
                    if (e instanceof StopIteration) {
                        defined = true;
                    }
                }
            });
        }
    } catch (e) {}
    if (!defined) {
        var StopIteration = function StopIteration() { return StopIteration; };
        (function(s) {
            s.name = 'StopIteration';
            s.toString = function() { return s.name; };
            s.prototype = {
                constructor: s,
                name: s.name,
                toString: s.toString
            };
            s.prototype.constructor.prototype = s.constructor.prototype;
        })(StopIteration);
        StopIteration = new StopIteration();
    }
    return ((o || {}).StopIteration = StopIteration) && StopIteration;
})(Pot);


//-----------------------------------------------------------------------------
// Pot extend
//-----------------------------------------------------------------------------
Pot.extend = function() {
    let args = arguments, i = 1, target, prop, sub, len = args.length;
    if (len === i) {
        target = this;
        i--;
    } else {
        target = args[i - 1];
    }
    if (target) {
        do {
            sub = args[i];
            if (sub) {
                for (prop in sub) {
                    target[prop] = sub[prop];
                }
            }
        } while (++i < len);
    }
    return target;
};

// Path/Directory Delimiter
Pot.extend({
    PATH_DELIMITER: Pot.os.win ? ';' : ':',
    DIR_DELIMITER: Pot.os.win ? '\\' : '/'
});

// Pref methods
(function() {

const P = POT_PREF_KEY_PREFIX;

Pot.extend({
    getPref: function(name) {
        return getPref(String(name).indexOf(P) === -1 ? P + name : name);
    },
    setPref: function(name, value) {
        return setPref(String(name).indexOf(P) === -1 ? P + name : name, value);
    }
});

})();
//-----------------------------------------------------------------------------
// Pot - Core
//-----------------------------------------------------------------------------
(function() {

// Define distinction of types
(function() {
    // typeof | is* functions
    var toString = Object.prototype.toString, types = {};
    <>
    Boolean Number String Function Array Date RegExp Object 
    </>.toString().trim().split(/\s+/).forEach(function(type) {
        types[type] = '[object ' + type + ']';
    });
    /**
     * Object Type 判別
     *
     * @example  isString('hoge');
     * @results  true
     *
     * @example  isArray(12345);
     * @results  false
     */
    forEach(types, function([key, val]) {
        Pot['is' + key] = function(o) {
            return toString.call(o) === val;
        };
    });
})();

// Define Hash object
Pot.extend({
    Hash: (function() {
        const prefix = '.';
        var Hash = function() {
            var args = arguments;
            return new args.callee.prototype.init(args);
        };
        Hash.prototype = {
            constructor: Hash,
            isHash: true,
            length: 0,
            init: function(args) {
                var i, p, a = Array.prototype.slice.call(args), len;
                for (i = 0, len = a.length; i < len; i++) {
                    this.set(a[i]);
                }
                return this;
            },
            get: function(key) {
                return this[prefix + String(key)];
            },
            set: function(key, value) {
                var p;
                if (key &&
                    typeof key === 'object' && key.constructor !== String) {
                    for (p in key) {
                        this.set(p, key[p]);
                    }
                } else {
                    this[prefix + String(key)] = value;
                    this.length++;
                }
                return this;
            },
            has: function(key) {
                return ((prefix + String(key)) in this);
            },
            remove: function(key) {
                delete this[prefix + String(key)];
                this.length--;
                return this;
            },
            clear: function() {
                var self = this;
                return this.each(function(key) {
                    self.remove(key);
                });
            },
            //TODO: Iterator用のメソッド作る
            each: function(callback) {
                var p, key, val, func;
                func = callback || (function() {});
                for (p in this) {
                    if (p.charAt(0) === prefix) {
                        key = p.substring(1);
                        val = this[p];
                        try {
                            if (func.call(null, key, val) === false) {
                                break;
                            }
                        } catch (e) {
                            try {
                                if (e == StopIteration ||
                                    e instanceof StopIteration) {
                                    break;
                                }
                            } catch (er) {}
                            throw e;
                        }
                    }
                }
                return this;
            },
            keys: function() {
                var keys = [], p;
                for (p in this) {
                    if (p.charAt(0) === prefix) {
                        keys[keys.length] = p.substring(1);
                    }
                }
                return keys;
            },
            values: function() {
                var values = [], p;
                for (p in this) {
                    if (p.charAt(0) === prefix) {
                        values[values.length] = this[p];
                    }
                }
                return values;
            },
            toObject: function() {
                var object = {};
                this.each(function(key, val) {
                    try {
                        object[key] = val;
                    } catch (e) {}
                });
                return object;
            }
        };
        Hash.prototype.init.prototype = Hash.prototype;
        Hash.prototype.forEach = Hash.prototype.each;
        return Hash;
    })()
});

// Core methods
Pot.extend({
    // escape/unescape HTML entities
    escapeHTML: function(text) {
        var doc = Pot.getDocument(), elem = doc.createElement('div');
        elem.appendChild(doc.createTextNode(Pot.StringUtil.stringify(text)));
        return elem.innerHTML;
    },
    unescapeHTML: function(text) {
        var result = '', elem, decode, re;
        re = /&(?:[a-z]\w{0,24}|#(?:x[0-9a-f]{1,8}|[0-9]{1,10}));/gi;
        elem = Pot.getDocument().createElement('div');
        decode = function(s) {
            var c = '';
            elem.innerHTML = String(s);
            try {
                c = elem.childNodes[0].nodeValue;
                elem.removeChild(elem.firstChild);
                if (!c || String(s).length > String(c).length) {
                    throw c;
                }
            } catch (e) {
                c = String(s);
            }
            return c;
        };
        result = Pot.StringUtil.stringify(text).replace(re, function(m) {
            return String(decode(m) || m);
        });
        return result;
    },
    // Escape XPath Expression
    escapeXPathText: function(text) {
        var i, result, re, matches, len, esc, sq, wq;
        re = /[^"]+|"/g;
        wq = '"';
        sq = "'";
        esc = function(s) {
            return s === wq ? sq + s + sq : wq + s + wq;
        };
        matches = Pot.StringUtil.stringify(text).match(re);
        if (matches) {
            if (matches.length === 1) {
                result = esc(matches[0]);
            } else {
                result = [];
                len = matches.length;
                for (i = 0; i < len; ++i) {
                    result.push(esc(matches[i]));
                }
                result = 'concat(' + result.join(',') + ')';
            }
        } else {
            result = wq + wq;
        }
        return result;
    },
    /**
     * 正規表現をエスケープ
     */
    escapeRegExp: function(s) {
        return Pot.StringUtil.stringify(s).replace(/([-.*+?^${}()|[\]\/\\])/g, '\\$1');
    },
    /**
     * AppleScriptで使う文字列をエスケープ
     */
    escapeAppleScriptString: function(s) {
        return Pot.StringUtil.stringify(s).replace(/(["\\])/g, '\\$1');
    },
    /**
     * ファイル名をエスケープ
     * Based: Tombloo.validateFileName
     */
    escapeFileName: function(fileName) {
        var s, re;
        s = Pot.StringUtil.stringify(fileName);
        if (s) {
            re = [{from: /[\u0000-\u0008]+/g, to: ''}];
            if (Pot.os.win) {
                re.push(
                    {from: /[\/|\\]+/g, to: '_'},
                    {from: /["]+/g,     to: "'"},
                    {from: /[*:;?]+/g,  to: ' '},
                    {from: /[<]+/g,     to: '('},
                    {from: /[>]+/g,     to: ')'}
                );
            } else if (Pot.os.mac) {
                re.push({from: /[\/:]+/g, to: '_'});
            }
            re.push(
                {from: /[*\/\\]+/g,      to:  '_'},
                {from: /([_()])\1{2,}/g, to: '$1'}
            );
            re.forEach(function(r) {
                s = s.replace(r.from, r.to);
            });
        }
        return s;
    },
    /**
     * DOM XULWindow
     */
    getWindow: function() {
        var win;
        try {
            win = getMostRecentWindow().content;
        } catch (e) {
            win = window;
        }
        return win;
    },
    /**
     * DOM XULDocument
     */
    getDocument: function() {
        var doc;
        try {
            doc = Pot.getWindow().document;
            if (!doc) {
                throw doc;
            }
        } catch (e) {
            try {
                doc = currentDocument();
            } catch (e) {
                doc = document;
            }
        }
        return doc;
    },
    /**
     * DOM Window DocumentWindow
     */
    getCurrentWindow: function() {
        return Pot.getDocument().defaultView;
    },
    /**
     * DOM HTMLDocument
     */
    getCurrentDocument: function() {
        var doc;
        try {
            doc = Pot.getCurrentWindow().document;
            if (!doc) {
                throw doc;
            }
        } catch (e) {
            doc = Pot.getDocument();
        }
        return doc;
    },
    /**
     * 対象のURIまたは現在のURIを取得する
     *
     * @param  {Object}  context    対象のオブジェクト (i.e., document)
     * @param  {Boolean} recursive  (internal only)
     * @return {String}             取得したURI or 空文字 ''
     */
    getCurrentURI: function(context, recursive) {
        let self = arguments.callee, result = '', i, len, docs, doc, c;
        doc = context || Pot.getCurrentDocument() || document;
        if (doc) {
            docs = [
                doc, doc.document, doc.window,
                doc.content, doc.content && doc.content.document,
                doc.defaultView, doc.defaultView && doc.defaultView.document
            ];
            len = docs.length;
            for (i = 0; i < len; i++) {
                c = docs[i];
                result = c && (c.URL || c.baseURI || c.documentURI ||
                        (c.location && c.location.href));
                if (result) {
                    break;
                }
            }
            if (!result && !recursive && doc.ownerDocument) {
                result = self(doc.ownerDocument, true);
            }
        }
        return Pot.StringUtil.stringify(result);
    },
    /**
     * 値が"数えられるか"調べる
     *
     * @param  {Mixed}    n   対象の値
     * @return {Boolean}      数えられるなら true, 数えられないなら false
     * -----------------------------------------------------------------------
     * @example  Pot.isNumeric(0);
     * @results  true
     *
     * @example  Pot.isNumeric(1234567890);
     * @results  true
     *
     * @example  Pot.isNumeric(null);
     * @results  false
     *
     * @example  Pot.isNumeric((void 0));
     * @results  false
     *
     * @example  Pot.isNumeric('abc');
     * @results  false
     *
     * @example  Pot.isNumeric('0xFF');
     * @results  true
     *
     * @example  Pot.isNumeric('1e8');
     * @results  true
     *
     * @example  Pot.isNumeric('10px');
     * @results  false
     *
     * @example  Pot.isNumeric('-512 +1');
     * @results  false
     *
     * @example  Pot.isNumeric([]);
     * @results  false
     *
     * @example  Pot.isNumeric([100]);
     * @results  false
     *
     * @example  Pot.isNumeric(new Date());
     * @results  false
     *
     * @example  Pot.isNumeric({});
     * @results  false
     *
     * @example  Pot.isNumeric(function(){});
     * @results  false
     *
     */
    isNumeric: function(n) {
        return (n == null || n === '' ||
                      typeof n === 'object') ? false : !isNaN(n - 0);
    },
    /**
     * 乱数を返す (浮動小数点対応)
     *
     *
     * @example  rand(0, 1);
     * @results  1  (first tried)
     *
     * @example  rand(5, 5);
     * @results  5
     *
     * @example  rand(10, 1);
     * @results  7  (first tried)
     *
     * @example  rand(2.5, 5.75);
     * @results  4.64  (first tried)
     *
     * @example  rand(1, 1.8765);
     * @results  1.5087  (first tried)
     *
     *
     * @param  {Number}  (min)  最小の数値 or 最大の数値
     * @param  {Number}  (max)  最大の数値 or 最小の数値
     * @return {Number}         min ～ max 間の乱数 (min, max を含む)
     */
    rand: function(min, max) {
        var result = 0, t, n, x, scale, getScale;
        getScale = function(a) {
            var s = a.toString();
            return s.indexOf('.') === -1 ? 0 : s.split('.').pop().length;
        };
        switch (arguments.length) {
            case 0: // Int32
                x = 0x7fffffff;
                n = ~x;
                break;
            case 1:
                n = 0;
                x = min - 0;
                break;
            default:
                n = min - 0;
                x = max - 0;
                break;
        }
        if (n > x) {
            t = x;
            x = n;
            n = t;
        }
        if (isNaN(n) || isNaN(x)) {
            result = 0;
        } else {
            scale = Math.max(getScale(n), getScale(x));
            if (scale) {
                result = (Math.random() * (x - n) + n).toFixed(scale);
            } else {
                result = Math.floor(Math.random() * (x - n + 1)) + n;
            }
        }
        return result - 0;
    },
    /**
     * UNIXタイムスタンプを取得
     */
    time: function() {
        return Math.round((new Date()).getTime() / 1000);
    },
    /**
     * ミリ秒も含めた現在のタイムスタンプを取得
     */
    mtime: function() {
        return (new Date()).getTime();
    },
    /**
     * 日付時刻をフォーマット
     * Pot.DateUtil参照
     */
    date: function() {
        var args = Pot.ArrayUtil.toArray(arguments);
        return Pot.DateUtil.format.apply(Pot.DateUtil, args);
    },
    /**
     * 指定秒数の間、待機する
     *
     * @example sleep(5); // 5秒待つ
     *
     * @param  {Number}  seconds  秒数
     */
    sleep: function(seconds) {
        let sec = seconds - 0;
        Pot.msleep(sec * 1000);
    },
    /**
     * 指定ミリ秒数の間、待機する
     *
     * @example msleep(500); // 500ミリ秒待つ
     *
     * @param  {Number}  milliseconds  待機するミリ秒
     */
    msleep: function(milliseconds) {
        let msec = milliseconds - 0, time;
        if (!isNaN(msec) && msec > 0) {
            time = Pot.mtime();
            till(function() {
                return Pot.mtime() - time >= msec;
            });
        }
    },
    /**
     * sprintf
     *
     * PHPの仕様を参考にしたのでPHPのsprintf互換
     * http://php.net/function.sprintf
     *
     * 拡張した型指定子:
     *
     *   - a : base36 でエンコードした結果を小文字で返す
     *   - A : base36 でエンコードした結果を大文字で返す
     *
     * @param  {String}  format   フォーマット文字列
     * @param  {Mixed}   ...      引数
     * @return {String}           変換された結果
     */
    sprintf: (function() {
        var args, re, rep, base, pad, justify, parse, utf8, isNumeric, stringify;
        re = /%%|%('?(?:[0\u0020+-]|[^%\w.-])+|)(\d*|)(\.\d*|)([%a-z])/gi;
        utf8 = function(s) {
            return Pot.StringUtil.utf8.encode(s);
        };
        isNumeric = function(n) {
            return Pot.isNumeric(n);
        };
        stringify = function(s) {
            return Pot.StringUtil.stringify(s);
        };
        parse = function(n, isFloat) {
            var r = isFloat ? parseFloat(n) : parseInt(n);
            return isNaN(r) ? 0 : r;
        };
        base = function(n, val) {
            var r, i, len, octets;
            if (isNumeric(val)) {
                r = (parse(val) >>> 0).toString(n);
            } else {
                r = '';
                octets = utf8(val);
                len = octets.length;
                for (i = 0; i < len; ++i) {
                    r += octets.charCodeAt(i).toString(n);
                }
            }
            return String((r && r.length) ? r : 0);
        };
        pad = function(value, mark, width, precision, left, numeric) {
            var glue;
            width = Number(width);
            precision = Number(precision);
            if (value.length < width) {
                mark = stringify(mark) || ' ';
                glue = new Array(width + 1).join(mark).split('');
                while (glue && (glue.length + value.length > width)) {
                    if (left) {
                        glue.pop();
                    } else {
                        glue.shift();
                    }
                }
                glue = glue.join('');
                value = left ? glue + value : value + glue;
            }
            return value;
        };
        justify = function(value, mark, width, precision, left, numeric) {
            var sign, orgn, index, i, prevIdx;
            if (numeric) {
                value = value.toString();
                if (mark.charAt(0) === '+') {
                    if (Number(value) >= 0) {
                        if (numeric.call) {
                            value = mark.charAt(0) + numeric(value);
                        } else {
                            value = mark.charAt(0) + Number(value);
                        }
                    }
                    mark = mark.substring(1);
                }
                if (mark.charAt(0) === '-') {
                    left = false;
                    mark = '';
                }
                sign = value.charAt(0);
                if ('+-'.indexOf(sign) === -1) {
                    sign = null;
                } else {
                    orgn = value.substring(1);
                }
            }
            width = String(width).length ? Number(width) : -1;
            precision = String(precision).length ? Number(precision) : -1;
            if (width === 0) {
                value = '';
            } else {
                if (precision > 0) {
                    value = value.slice(0, precision);
                }
                if (width > 0 && width > value.length) {
                    value = pad(value, mark, width, precision, left, numeric);
                }
            }
            if (numeric && orgn && sign) {
                i = 1;
                do {
                    prevIdx = index;
                    index = value.indexOf(sign + orgn.slice(0, i));
                } while (index > 0 && ++i < value.length);
                if (index === -1) {
                    index = prevIdx;
                }
                if (index > 0) {
                    value = sign + value.slice(0, index) + value.slice(index + 1);
                }
            }
            return value;
        };
        rep = function(all, mark, width, precision, type) {
            var result = '', v, left, numeric = false, point;
            if (all === '%%') {
                result = '%';
            } else {
                left = true;
                if (mark.slice(-1) === '-') {
                    left = false;
                    mark = mark.slice(0, -1);
                }
                if (mark.indexOf("'") === 0) {
                    if (mark.length > 1) {
                        mark = mark.substring(1);
                    }
                }
                if (precision.indexOf('.') === 0) {
                    precision = precision.substring(1);
                }
                v = stringify(args.shift());
                switch (type) {
                    case 'b':
                        v = base(2, v);
                        break;
                    case 'c':
                        try {
                            v = isNumeric(v) ? String.fromCharCode(v) : '';
                        } catch (e) {
                            v = '';
                        }
                        break;
                    case 'd':
                        numeric = true;
                        v = parse(v);
                        break;
                    case 'u':
                        numeric = true;
                        v = parse(v) >>> 0;
                        break;
                    case 'e':
                        numeric = true;
                        point = 6;
                        v = parse(v, true);
                        if (precision) {
                            if (isNumeric(precision)) {
                                point = Math.max(0, Math.min(20, precision));
                            }
                            precision = null;
                        }
                        numeric = function(n) {
                            return Number(n).toExponential(point);
                        };
                        v = numeric(v);
                        break;
                    case 'f':
                        numeric = true;
                        point = 6;
                        v = parse(v, true);
                        if (precision) {
                            if (isNumeric(precision)) {
                                precision = (v < 0 ? 1 : 0) + Number(precision);
                                point = Math.max(0, Math.min(20, precision));
                            }
                            precision = null;
                        }
                        numeric = function(n) {
                            return Number(n).toFixed(point);
                        };
                        v = numeric(v);
                        break;
                    case 'o':
                        v = base(8, v);
                        break;
                    case 'x':
                        v = base(16, v).toLowerCase();
                        break;
                    case 'X':
                        v = base(16, v).toUpperCase();
                        break;
                    case 's':
                        break;
                    case 'a':
                        v = base(36, v).toLowerCase();
                        break;
                    case 'A':
                        v = base(36, v).toUpperCase();
                        break;
                    default:
                        break;
                }
                result = justify(v, mark, width, precision, left, numeric);
            }
            return String(result);
        };
        return function(format) {
            args = Array.prototype.slice.call(arguments, 0).slice(1);
            return stringify(format).replace(re, rep);
        };
    })(),
    /**
     * オブジェクトを結合して文字列で返す
     *
     * @example implode({color:'blue',margin:'5px'}, ':', ';', true);
     * @results 'color:blue;margin:5px;'
     *
     * 引数の順序は違っててもよい (文字列としてglueが先になる)
     *
     * @example implode('+', {a:1, b:2, c:3}, '*');
     * @results 'a+1*b+2*c+3'
     *
     * tailが文字列の場合はtailそのものが付けられる
     *
     * @example implode('>>', {a:1, b:2, c:3}, '^', '==?');
     * @results 'a>>1^b>>2^c>>3==?'
     *
     *
     * @param  {Object}  object  対象のオブジェクト
     * @param  {String}  (glue)  各プロパティ名と値を結合する文字 (default = ':')
     * @param  {String}  (sep)   前のプロパティと次のプロパティを結合する文字 (default = ',')
     * @param  {Boolean} (tail)  結合した文字列の最後に sep を付ける場合 true
     * @return {String}          結合された文字列
     */
    implode: function(object, glue, sep, tail) {
        var result = '', ins = [], defs, p, g, s, o, t;
        var args = arguments, len = args.length, i;
        defs = {
            glue: ':',
            sep: ','
        };
        for (i = 0; i < len; i++) {
            if (!o && Pot.isObject(args[i])) {
                o = args[i];
            } else if (!g && Pot.isString(args[i])) {
                g = args[i];
            } else if (!s && Pot.isString(args[i])) {
                s = args[i];
            } else if (Pot.isObject(o) && Pot.isString(g) && Pot.isString(s)) {
                t = args[i];
            }
        }
        if (o && Pot.isObject(o)) {
            if (g === undefined) {
                g = defs.glue;
            }
            if (s === undefined) {
                s = defs.sep;
            }
            for (p in o) {
                ins[ins.length] = p + g + Pot.StringUtil.stringify(o[p]);
            }
            result = ins.join(s);
            if (t) {
                result += Pot.isString(t) ? t : s;
            }
        }
        return result;
    },
    /**
     * オブジェクトを強引にオーバーライドして関数内部のコードを置換する
     *
     * @param  {Object}    context                thisになる親オブジェクト
     * @param  {String}    name                   オーバーライド対象の名前
     * @param  {Function}  callback (optionally)  内部コードを置換する場合のコールバック関数
     * @param  {Boolean}   define   (optionally)  置換後の関数を context スコープで定義する場合true
     * @param  {Object}    extra    (optionally)  prototypeに追加するオブジェクト
     *
     * @return {Object}    define=true: 宣言済みのオーバーライドしたオブジェクトが返る
     *                     define=false: まだ宣言してない内部コードを置換された関数オブジェクトが返る
     */
    override: function(context, name, callback, define, extra) {
        var orgProto, orgSource, source, result, caller;
        try {
            context = context ||
                      typeof global !== 'undefined' && global ||
                      typeof grobal !== 'undefined' && grobal || window;
            if (!Pot.isFunction(context[name])) {
                for (caller = arguments.callee.caller; caller != null; caller = caller.caller) {
                    if (typeof caller[name] !== 'undefined' && Pot.isFunction(caller[name])) {
                        context = caller;
                        break;
                    }
                }
            }
            if (typeof context[name] === 'undefined') {
                throw new Error('Cannot search context');
            }
            callback = callback || (function(a) { return a });
            orgProto = context[name].prototype;
            orgSource = context[name].toString();
            source = callback(orgSource);
            if (define) {
                eval.call(context, source);
                context[name].prototype = orgProto;
                if (extra) {
                    update(context[name].prototype, extra);
                }
                result = context[name];
            } else {
                result = Function('return ' + source)();
                result.prototype = orgProto;
            }
        } catch (e) {
            throw e;
        }
        return result;
    },
    /**
     * 現在のwindow.documentのtextContentを取得する
     * ニュースサイトやブログなどで可能なかぎり記事のみ抽出する
     * 見つからなかった場合はHTML全体のテキストを取得
     * タグやコメントは除去した結果になる
     *
     * @param  {Document}  context  対象のdocument(省略すると現在のdocument)
     * @param  {String}    xpath    取得したいXPath(省略時は適当に選ぶ)
     * @return {String}             取得したテキスト
     */
    getTextContent: function(context, xpath) {
        var text = '', doc, ids, node, found, names, expr;
        if (context && Pot.isString(context)) {
            [doc, expr] = [xpath, context];
        }
        doc = doc || context || Pot.getDocument();
        expr = xpath || null;
        try {
            if (expr) {
                try {
                    text = $x(expr, doc);
                } catch (e) {}
            }
            if (!text) {
                ids = Pot.StringUtil.trim(<>
                    Head-Line
                    Entry-Content
                    Article-Body
                    Article
                    Blog-Body
                    Body
                    H-Entry
                    Entry
                    Main-Content
                    Main-Contents
                    Block-Contents
                    Contents-Block
                    Block-Content
                    Content-Block
                    Main
                    Content
                    Contents
                    Section
                    Posts
                    Post
                    Container
                </>).split(/\s+/);
                node = null;
                found = false;
                ids.forEach(function(id) {
                    if (!found) {
                        if (id) {
                            names = [id, id.toLowerCase()];
                            if (id.indexOf('-') !== -1) {
                                names.push(id.split('-').join(''), id.split('-').join('').toLowerCase());
                            }
                            names.forEach(function(name) {
                                if (!found) {
                                    node = $x(Pot.sprintf('//*[@id="%s"]', name), doc);
                                    if (!node) {
                                        node = $x(Pot.sprintf('//*[contains(@class,"%s")]', name), doc);
                                    }
                                    if (node && Pot.StringUtil.trimAll(node.textContent).length > 256) {
                                        found = true;
                                    } else {
                                        node = null;
                                    }
                                }
                            });
                        }
                    }
                });
                text = convertToHTMLString(node || doc.body || doc.documentElement, true);
            }
            if (text) {
                text = Pot.StringUtil.normalizeSpace(Pot.StringUtil.removeNoise(Pot.StringUtil.removeAA(
                        Pot.StringUtil.remove2chName(Pot.unescapeHTML(Pot.StringUtil.stripTags(text)))))).replace(/\s+/g, ' ');
            }
        } catch (e) {}
        return text;
    },
    /**
     * 中途半端なURIを補完して返す。'..' や './' なども階層修正する
     *
     *
     * @example resolveRelativeURI('C:/path/to/foo/bar/../hoge.ext');
     * @results 'C:/path/to/foo/hoge.ext'
     *
     * @example resolveRelativeURI('C:/path/to/../../hoge.ext');
     * @results 'C:/hoge.ext'
     *
     * @example resolveRelativeURI('C:/path/to/../../../../././../../hoge.ext');
     * @results 'C:/hoge.ext'
     *
     * @example resolveRelativeURI('/////path/to/////hoge.ext', document);
     * @results 'http://www.example.com/path/to/hoge.ext'
     *
     * @example resolveRelativeURI('./hoge.png', document.getElementById('image1'));
     * @results 'http://www.example.com/example.dir1/hoge.png'
     *
     * @example resolveRelativeURI('/usr/local/bin/../././hoge.ext');
     * @results '/usr/local/hoge.ext'
     *
     *
     * @param  {String}  uri     対象のURI (nsILocalFileなどでもよい)
     * @param  {Object}  context URIの補完で参照するオブジェクト(i.e., document)
     * @return {String}          完成したURI(絶対パス)
     */
    resolveRelativeURI: function(uri, context) {
        var result, sep, path, parts, part, subs, len, doc, protocol, re, cur;
        re = /^([a-z]\w*:[\/\\]*)/i;
        cur = '';
        if (arguments.length >= 2) {
            cur = Pot.getCurrentURI(context);
        }
        path = Pot.StringUtil.trim(Pot.StringUtil.trim(uri && uri.path || uri) || cur);
        if (!path) {
            result = cur;
        } else {
            sep = '/';
            if (path.indexOf(sep) === -1) {
                sep = '\\';
            }
            if (re.test(cur) && path.indexOf(sep) === 0) {
                cur = cur.replace(/^(\w+:[\/\\]*[^\/\\]*[\/\\]).*$/i, '$1');
            }
            if (!re.test(path)) {
                path = cur.replace(/([\/\\])[^\/\\]*$/g, '$1') + path;
            }
            protocol = '';
            if (re.test(path)) {
                path = path.replace(re, function(m) {
                    protocol = m;
                    return '';
                });
            }
            parts = path.split(/[\/\\]/);
            len = parts.length;
            subs = [];
            while (--len >= 0) {
                part = parts.shift();
                if (!part || part.indexOf('.') === 0) {
                    if (part === '..') {
                        subs.pop();
                    }
                    continue;
                }
                subs.push(part);
            }
            result = protocol + subs.join(sep);
            // UNIX Path
            if (!re.test(result)) {
                result = sep + result;
            }
        }
        return Pot.StringUtil.stringify(result);
    },
    /**
     * ファイルの拡張子を取得する(URIにも有効)
     *
     * @param  {String}  path  対象のファイル名(URI)
     * @return {String}        拡張子(ドット[.]は含まない)
     */
    getExt: function(path) {
        let result = '', uri, fileName, ext, re;
        re = /\W/;
        fileName = Pot.StringUtil.stringify((path && path.path) ? path.path : path);
        if (fileName && fileName.indexOf('.') !== -1) {
            uri = createURI(fileName);
            if (uri && uri.fileExtension) {
                result = Pot.StringUtil.stringify(uri.fileExtension);
                while (result.charAt(0) === '.') {
                    result = result.substring(1);
                }
            }
            if (!result || re.test(result)) {
                ext = Pot.StringUtil.trimAll(fileName.replace(/[#?][\s\S]*$/g, '')).
                    split('.').filter(function(s) {
                        return s && s.length;
                    }).pop();
                if (ext && !re.test(ext)) {
                    result = ext;
                } else {
                    result = ext.length < result ? result : ext;
                }
            }
        }
        return result;
    },
    /**
     * Dataスキーム(URI)を生成して返す
     *
     * RFC 2397 - The "data" URL scheme
     * http://tools.ietf.org/html/rfc2397
     *
     * data:[<mime type>][;charset=<charset>][;base64],<encoded data>
     *
     * @param  {String}   data       対象のデータ
     * @param  {String}   mimetype   MIME Type (e.g. image/png)
     * @param  {Boolean}  (base64)   Base64フォーマットのデータ(data)かどうか
     * @param  {String}   (charset)  文字コードを指定する場合ここに与える
     * @return {String}              生成されたDataURI
     */
    toDataURI: function(data, mimetype, base64, charset) {
        let uri = '', type, chr = '', b64 = '';
        if (data) {
            type = Pot.StringUtil.stringify(mimetype).trim().toLowerCase();
            if (type && type.indexOf('/') === -1) {
                type = Pot.mimeType.getType(type);
            }
            if (!type) {
                type = '*/*';
            }
            if (charset) {
                chr = Pot.sprintf(';charset=%s', charset);
            }
            if (base64) {
                b64 = ';base64';
            }
            uri = Pot.sprintf('data:%s%s%s,%s', type, chr, b64, data);
        }
        return uri;
    }
});

// toDataURI拡張
Pot.extend(Pot.toDataURI, {
    /**
     * 引数dataをURIエンコードしてそのDataスキーム(URI)を生成して返す
     *
     * @see Pot.toDataURI
     *
     * @param  {String}   data       対象のデータ
     * @param  {String}   mimetype   MIME Type (e.g. image/png)
     * @param  {String}   (charset)  文字コードを指定する場合ここに与える
     * @return {String}              生成されたDataURI
     */
    encodeURI: function(data, mimetype, charset) {
        return Pot.toDataURI(
            encodeURIComponent(Pot.StringUtil.stringify(data)),
            mimetype,
            false,
            charset
        );
    },
    /**
     * 引数dataをBase64エンコードしてそのDataスキーム(URI)を生成して返す
     *
     * @see Pot.toDataURI
     *
     * @param  {String}   data       対象のデータ
     * @param  {String}   mimetype   MIME Type (e.g. image/png)
     * @param  {String}   (charset)  文字コードを指定する場合ここに与える
     * @return {String}              生成されたDataURI
     */
    base64: function(data, mimetype, charset) {
        return Pot.toDataURI(
            Pot.StringUtil.base64.encode(data),
            mimetype,
            true,
            charset
        );
    }
});


})();
//-----------------------------------------------------------------------------
// DateUtil - 日付/日時処理 Utilities
//-----------------------------------------------------------------------------
(function() {

/**
 * DateUtil
 */
Pot.DateUtil = {};
Pot.extend(Pot.DateUtil, {
    ATOM    : 'Y-m-d\\TH:i:sP',
    COOKIE  : 'l, d-M-y H:i:s T',
    ISO8601 : 'Y-m-d\\TH:i:sO',
    RFC822  : 'D, d M y H:i:s O',
    RFC850  : 'l, d-M-y H:i:s T',
    RFC1036 : 'D, d M y H:i:s O',
    RFC1123 : 'D, d M Y H:i:s O',
    RFC2822 : 'D, d M Y H:i:s O',
    RFC3339 : 'Y-m-d\\TH:i:sP',
    RSS     : 'D, d M Y H:i:s O',
    W3C     : 'Y-m-d\\TH:i:sP',
    /**
     * 日付時刻をフォーマットして返す
     *
     * たぶんPHPのdate()関数と同じに動く
     * (PHPのdate()関数のフォーマットを参照)
     * http://php.net/function.date
     *
     * 次の文字をエスケープする場合は '\\' を使う
     *
     * ------------------------------------------------
     * 拡張したフォーマット:
     *   - J : 日本語の曜日 (日 ～ 土)
     *   - o : 日本語の旧月 (霜月, 水無月, etc.)
     * ------------------------------------------------
     *
     * @example format('Y-m-d H:i:s');
     * @results '2011-06-07 01:25:17'
     *
     * @example format('Y/m/d (J) H:i [\\o=o]');
     * @results '2011/06/08 (水) 11:30 [o=水無月]'
     *
     * @example format(RFC2822);
     * @results 'Wed, 08 Jun 2011 02:34:21 +0900'
     *
     *
     * @param  {String}           pattern   フォーマット文字列 (e.g. 'Y-m-d')
     *         {Date || Number}   (date)    (optional)時刻を与える場合の値
     *
     * @return {String}                     フォーマット済みの文字列
     */
    format: function(pattern, date) {
        let result = '', self = this, fm, d, o;
        if (pattern instanceof Date) {
            [pattern, date] = [date, pattern];
        }
        fm = Pot.StringUtil.stringify(pattern);
        if (date instanceof Date) {
            d = date;
        } else if (Pot.isNumeric(date) || (date && Pot.isString(date))) {
            d = new Date(date);
        } else {
            d = new Date();
        }
        if (fm) {
            o = {
                year     : d.getFullYear(),
                month    : d.getMonth(),
                date     : d.getDate(),
                day      : d.getDay(),
                hours    : d.getHours(),
                minutes  : d.getMinutes(),
                seconds  : d.getSeconds(),
                mseconds : d.getMilliseconds(),
                timezone : d.getTimezoneOffset(),
                time     : d.getTime()
            };
            result = fm.replace(this.translatePattern, function(m) {
                return self.translate(m, o);
            });
        }
        return result;
    },
    translatePattern: /(?:[\\].|[a-zA-Z])/g,
    translate: function(c, d) {
        switch (c.charAt(0)) {
            case '\\': return c.charAt(1);
            case 'A': return this.toAMPM(d.hours).toUpperCase();
            case 'a': return this.toAMPM(d.hours);
            case 'c': return this.format(this.ATOM);
            case 'D': return this.week.en[d.day].substr(0, 3);
            case 'd': return this.padZero(d.date);
            case 'F': return this.month.en[d.month];
            case 'G': return d.hours;
            case 'g': return this.to12Hour(d.hours);
            case 'H': return this.padZero(d.hours);
            case 'h': return this.padZero(this.to12Hour(d.hours));
            case 'i': return this.padZero(d.minutes);
            case 'J': return this.week.ja[d.day];
            case 'j': return d.date;
            case 'L': return this.isLeapYear(d.year);
            case 'l': return this.week.en[d.day];
            case 'M': return this.month.en[d.month].substr(0, 3);
            case 'm': return this.padZero(d.month + 1);
            case 'N': return this.isoDay(d.day);
            case 'n': return d.month + 1;
            case 'o': return this.month.ja[d.month];
            case 'O': return this.getTimezone(d.timezone);
            case 'P': return this.getTimezone(d.timezone, true);
            case 'r': return this.format(this.RFC2822);
            case 'S': return this.dateSuffix[d.date - 1];
            case 's': return this.padZero(d.seconds);
            case 'T': return this.getTimezoneName(d.timezone);
            case 't': return this.lastDayOfMonth(d);
            case 'U': return Math.round(d.time / 1000);
            case 'u': return Pot.StringUtil.leftPad(d.mseconds, 6, 0);
            case 'w': return d.day;
            case 'Y': return d.year;
            case 'y': return d.year.toString().substr(2, 2);
            case 'z': return this.countDate(d.year, d.month, d.date);
            case 'Z': return this.getTimezoneSec(d.timezone);
            default : break;
        }
        return c;
    },
    week: {
        en: [
            'Sunday',    'Monday',   'Tuesday',
            'Wednesday', 'Thursday', 'Friday',  'Saturday'
        ],
        ja: [
            '日', '月', '火', '水', '木', '金', '土'
        ]
    },
    month: {
        en: [
            'January', 'February', 'March',     'April',   'May',      'June',
            'July',    'August',   'September', 'October', 'November', 'December'
        ],
        ja: [
            '睦月', '如月', '弥生', '卯月',   '皐月', '水無月',
            '文月', '葉月', '長月', '神無月', '霜月', '師走'
        ]
    },
    dateSuffix: [
        'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th', 'th',
        'th', 'th', 'th', 'th', 'th', 'th', 'th', 'th', 'th', 'th',
        'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th', 'th', 'st'
    ],
    padZero: function(n) {
        return parseInt(n) < 10 ? '0' + n : n;
    },
    to12Hour: function(hours) {
        return hours > 12 ? hours - 12 : hours;
    },
    toAMPM: function(hours) {
        return (Number(hours) < 12 ? 'a' : 'p') + 'm';
    },
    isoDay: function(day) {
        return Number(day) === 0 ? '7' : day;
    },
    lastDayOfMonth: function(date) {
        let t = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        t.setTime(t.getTime() - 1);
        return t.getDate();
    },
    isLeapYear: function(year) {
        let d = new Date(year, 0, 1), sum = 0, i;
        for (i = 0; i < 12; i++) {
            d.setMonth(i);
            sum += this.lastDayOfMonth(d);
        }
        return String(sum === 365 ? 0 : 1);
    },
    countDate: function(year, month, date) {
        let d = new Date(year, 0, 1), sum = -1, i, max = Number(month);
        for (i = 0; i < max; i++) {
            d.setMonth(i);
            sum += this.lastDayOfMonth(d);
        }
        return sum + date;
    },
    getTimezone: function(offset, colon) {
        let result, o, a, sign;
        o = Number(offset) || 0;
        a = Math.abs(o);
        sign = o < 0 ? '+' : '-';
        result = Pot.sprintf('%s%02d%s%02d',
            sign,
            Math.floor(a / 60),
            colon ? ':' : '',
            a % 60
        );
        return result;
    },
    getTimezoneSec: function(offset) {
        let o = Number(offset) || 0;
        return Pot.sprintf('%s%d', o < 0 ? '' : '-',  Math.abs(o * 60));
    },
    getTimezoneName: function(offset) {
        let result, o, time, name, maps, def;
        maps = this.timezoneMaps;
        def = maps[1];
        o = Number(offset) || 0;
        time = Math.floor(-o / 60 * 3600);
        if (time === 0) {
            result = def;
        } else {
            for (name in maps) {
                if (maps[name] === time) {
                    result = name;
                    break;
                }
            }
        }
        return result || def;
    },
    timezoneMaps: {
        GMT  :   0,           // Greenwich Mean
        UTC  :   0,           // Universal (Coordinated)
        WET  :   0,           // Western European
        WAT  :  -1*3600,      // West Africa
        AT   :  -2*3600,      // Azores
        NFT  :  -3*3600-1800, // Newfoundland
        AST  :  -4*3600,      // Atlantic Standard
        EST  :  -5*3600,      // Eastern Standard
        CST  :  -6*3600,      // Central Standard
        MST  :  -7*3600,      // Mountain Standard
        PST  :  -8*3600,      // Pacific Standard
        YST  :  -9*3600,      // Yukon Standard
        HST  : -10*3600,      // Hawaii Standard
        CAT  : -10*3600,      // Central Alaska
        AHST : -10*3600,      // Alaska-Hawaii Standard
        NT   : -11*3600,      // Nome
        IDLW : -12*3600,      // International Date Line West
        CET  :  +1*3600,      // Central European
        MET  :  +1*3600,      // Middle European
        MEWT :  +1*3600,      // Middle European Winter
        SWT  :  +1*3600,      // Swedish Winter
        FWT  :  +1*3600,      // French Winter
        EET  :  +2*3600,      // Eastern Europe, USSR Zone 1
        BT   :  +3*3600,      // Baghdad, USSR Zone 2
        IT   :  +3*3600+1800, // Iran
        ZP4  :  +4*3600,      // USSR Zone 3
        ZP5  :  +5*3600,      // USSR Zone 4
        IST  :  +5*3600+1800, // Indian Standard
        ZP6  :  +6*3600,      // USSR Zone 5
        SST  :  +7*3600,      // South Sumatra, USSR Zone 6
        WAST :  +7*3600,      // West Australian Standard
        JT   :  +7*3600+1800, // Java
        CCT  :  +8*3600,      // China Coast, USSR Zone 7
        JST  :  +9*3600,      // Japan Standard, USSR Zone 8
        CAST :  +9*3600+1800, // Central Australian Standard
        EAST : +10*3600,      // Eastern Australian Standard
        GST  : +10*3600,      // Guam Standard, USSR Zone 9
        NZT  : +12*3600,      // New Zealand
        NZST : +12*3600,      // New Zealand Standard
        IDLE : +12*3600       // International Date Line East
    }
});


})();
//-----------------------------------------------------------------------------
// Deferred 拡張 (JSDeferred の機能相当のメソッドを実装)
//-----------------------------------------------------------------------------
(function() {


Pot.DeferredUtil = {};
Pot.extend(Pot.DeferredUtil, {
    /**
     * 関数を実行する
     * JSDeferred.call と同じに扱える。実装はTombloo/MochiKit仕様
     *
     * @param  {Function}   func   実行する関数
     * @return {Deferred}          callback済みのDeferred
     */
    call: function(func) {
        var args = Array.prototype.slice.call(arguments, 1);
        return (new Deferred()).addCallback(function() {
            return func.apply(this, args);
        }).callback();
    },
    /**
     * 指定回数ループ
     * JSDeferred.loop と同じに扱える。実装はTombloo仕様
     *
     * @param  {Number}     n      ループする回数
     * @param  {Function}   func   実行する関数
     * @return {Deferred}          callbackしてないDeferred
     */
    loop: function(n, func) {
        var result, step, o, d, i, waiting, time;
        o = {
            begin: n.begin || 0,
            end: Pot.isNumber(n.end) ? n.end : n - 1,
            step: n.step || 1,
            last: false,
            prev: null
        };
        step = o.step;
        d = new Deferred();
        d.addCallback(function() {
            i = o.begin;
            till(function() {
                let end = false;
                if (i > o.end) {
                    end = true;
                } else {
                    if (i + step > o.end) {
                        o.last = true;
                        o.step = o.end - i + 1;
                    }
                    o.prev = result;
                    try {
                        result = func.call(this, i, o);
                    } catch (e) {
                        if (e == StopIteration || e instanceof StopIteration) {
                            end = true;
                        } else {
                            throw e;
                        }
                    }
                    if (result instanceof Deferred) {
                        waiting = true;
                        try {
                            result.addCallback(function(res) {
                                result = res;
                                waiting = false;
                            });
                            if (!result.canceller || !(result.canceller.toString) ||
                                !/\b(?:clearTimeout)\b/.test(result.canceller.toString())) {
                                // wait(n) の場合は遅延実行される
                                result.callback();
                            }
                        } catch (e) {
                            waiting = false;
                        }
                    }
                    if (waiting) {
                        time = Pot.time();
                        till(function() {
                            if (Pot.time() - time >= 10) {
                                waiting = false;
                            }
                            return !waiting;
                        });
                    }
                    i++;
                }
                return end;
            });
            return result;
        });
        return d;
    },
    /**
     * 指定回数ループ
     * JSDeferred.repeat と同じに扱える。実装はTombloo仕様
     *
     * @param  {Number}     max    ループする回数
     * @param  {Function}   func   実行する関数
     * @return {Deferred}          callbackしてないDeferred
     */
    repeat: function(max, func) {
        var i = 0, result = null, d = new Deferred();
        d.addCallback(function() {
            var self = arguments.callee, time = Pot.mtime();
            divide: {
                do {
                    if (i >= max) {
                        break divide;
                    }
                    try {
                        result = func(i++);
                    } catch (e) {
                        if (e == StopIteration || e instanceof StopIteration) {
                            break divide;
                        }
                        throw e;
                    }
                } while (Pot.mtime() - time < 20);
                return Pot.DeferredUtil.call(self);
            }
            return null;
        });
        return d;
    }
});


})();
//-----------------------------------------------------------------------------
// Pot - ファイル操作オブジェクト
//-----------------------------------------------------------------------------
(function() {


Pot.FileUtil = {};
Pot.extend(Pot.FileUtil, {
    /**
     * FileOutputStream:
     * -------------------------------------------------------------------
     *   PR_RDONLY      : 0x01 : 読み込み専用
     *   PR_WRONLY      : 0x02 : 書き出し専用
     *   PR_RDWR        : 0x04 : 読み書き両方
     *   PR_CREATE_FILE : 0x08 : ファイルが存在しないならば作成する。
     *                           ファイルがあれば何もしない。
     *   PR_APPEND      : 0x10 : 書き込みごとにファイルポインタは
     *                           ファイルの最後にセットされる。(追記モード)
     *   PR_TRUNCATE    : 0x20 : ファイルが存在すれば、長さを 0 にする。
     *   PR_SYNC        : 0x40 : 書き込みごとにファイルデータとステータスが
     *                           物理的にアップデートされるのを待つ。
     *   PR_EXCL        : 0x80 : PR_CREATE_FILE と一緒に利用された場合、
     *                           ファイルが存在しなければ作成する。
     *                           ファイルが存在すれば、
     *                            NULL を返してなにもしない。 
     * -------------------------------------------------------------------
     *
     * File modes:
     * -----------------------------------------------------
     *   00400 Read by owner.
     *   00200 Write by owner.
     *   00100 Execute (search if a directory) by owner.
     *   00040 Read by group.
     *   00020 Write by group.
     *   00010 Execute by group.
     *   00004 Read by others.
     *   00002 Write by others
     *   00001 Execute by others.
     * -----------------------------------------------------
     */
    /**
     * ファイルの最後にデータを追加
     *
     * @param  putContents と同じ
     */
    appendContents: function(file, text, charset) {
        let f = Pot.FileUtil.assignLocalFile(file);
        if (!f.exists()) {
            putContents(f, '');
        }
        withStream(new FileOutputStream(f,
            FileOutputStream.PR_WRONLY |
            FileOutputStream.PR_APPEND, 420, -1), function(stream) {
            text = Pot.StringUtil.stringify(text).convertFromUnicode(charset);
            stream.write(text, text.length);
        });
    },
    /**
     * ファイルの先頭にデータを追加
     * (ファイルサイズが巨大だとメモリコストがすごい)
     *
     * @param  putContents と同じ
     */
    //FIXME: ストリームでメモリを抑えて実装
    prependContents: function(file, text, charset) {
        let f = Pot.FileUtil.assignLocalFile(file);
        return putContents(f, Pot.StringUtil.stringify(text) + getContents(f), charset);
    },
    /**
     * 一つ上の階層に変換 (ディレクトリ名のみに)
     *
     * @param  {String || ILocalFile}  path           対象のファイルパス
     * @param  {Boolean}               withDelimiter  最後にデミリタを付けるかどうか
     * @return {String}                               一つ上の階層のパス
     */
    dirname: function(path, withDelimiter) {
        let result = '', p, re, uri, sep, d;
        p = Pot.StringUtil.stringify(path && path.path || path);
        if (p) {
            re = /[\/\\]/g;
            d = withDelimiter;
            if (d && Pot.isString(d) && d.length === 1) {
                sep = d;
            } else if (p.indexOf('\\') === -1) {
                sep = '/';
            } else {
                sep = '\\';
            }
            try {
                result = Pot.StringUtil.stringify(createURI(p).parent.path);
                if (!result) {
                    throw result;
                }
            } catch (e) {
                p = p.split(re);
                p.pop();
                while (p && p.length && p[p.length - 1].length === 0) {
                    p.pop();
                }
                result = p.join(sep);
            }
            result = result.replace(re, sep);
            if (d && result.slice(-1) !== sep) {
                result += sep;
            }
        }
        return result;
    },
    /**
     * ファイルを削除する
     *
     * @param  {String || ILocalFile}  fileName   対象のファイルパス
     * @param  {Boolean}               recursive  再帰的に削除するかどうか
     * @return {Boolean}                          削除に成功すれば true
     *                                            もともとファイルがない場合も true
     */
    remove: function(fileName, recursive) {
        let file, result = false;
        file = Pot.FileUtil.assignLocalFile(fileName);
        if (!file.exists()) {
            result = true;
        } else {
            file.permissions = 0666;
            file.remove(!!recursive);
            if (!file.exists()) {
                result = true;
            }
        }
        return result;
    },
    /**
     * ファイルが存在するか調べる
     *
     * @param  {String || ILocalFile}  fileName  対象のファイルパス
     * @return {Boolean}                         存在すれば true
     */
    exists: function(fileName) {
        return  Pot.SetupUtil.assignLocalFile(fileName).exists();
    },
    /**
     * ファイルサイズを取得する
     *
     * @param  {String || ILocalFile}  fileName  対象のファイルパス
     * @return {Number}                          ファイルサイズ or ファイルがない場合false
     */
    fileSize: function(fileName) {
        let file, result = false;
        file = Pot.FileUtil.assignLocalFile(fileName);
        if (file.exists()) {
            result = file.fileSize - 0;
        }
        return result;
    },
    /**
     * リネームする
     *
     * @param  {String || ILocalFile}  fileName  対象のファイルパス
     * @param  {String}                newName   新しいファイル名
     * @return {Boolean}                         成功 or 失敗
     */
    rename: function(fileName, newName) {
        let file, result = false, name;
        if (fileName && newName) {
            file = Pot.FileUtil.assignLocalFile(fileName);
            name = Pot.escapeFileName(Pot.StringUtil.stringify(newName && newName.leafName || newName));
            if (name && file.exists()) {
                file.moveTo(null, name);
                if (file.leafName === name) {
                    result = true;
                }
            }
        }
        return result;
    },
    /**
     * ファイルパスを ILocalFile として生成して返す
     *
     * - tombloo:// という特殊文字が使える (tomblooフォルダを指す)
     *               - tombloo.data://  ::= データディレクトリ
     *               - tombloo.patch:// ::= パッチディレクトリ
     * - {TmpD}://  などの特殊文字が使える (DirectoryService参照)
     *
     * 基本的に getLocalFile を拡張したものなので file:/// スキームなども使える
     *
     *
     * @example assignLocalFile('tombloo://chrome/content/prefs.xul').path;
     * @results 'C:/.../extensions/tombloo@.../chrome/content/prefs.xul' (省略)
     *
     *
     * @param  {String || ILocalFile ||
     *           IFile || IURI}          filePath  対象のファイルパス
     * @return {ILocalFile}                        パスを割り当てたILocalFileオブジェクト
     */
    assignLocalFile: function(filePath) {
        let file, path, re, names;
        re = {
            tombloo: /^Tombloo:\/{0,}/i,
            data: /^(?:Tombloo[.]|)data(?:es|):\/{0,}/i,
            patch: /^(?:Tombloo[.]|)patch(?:es|):\/{0,}/i,
            defs: /^[{]([^{}]+?)[}]:\/{0,}/,
            sep: /[\/\\]/g
        };
        if (filePath instanceof ILocalFile) {
            file = filePath;
        } else {
            path = Pot.StringUtil.stringify(filePath && filePath.path || filePath);
            if (re.tombloo.test(path)) {
                file = Pot.FileUtil.getExtensionFile(path.replace(re.tombloo, ''));
            } else if (re.data.test(path) || re.patch.test(path)) {
                if (re.data.test(path)) {
                    file = getDataDir();
                    names = path.replace(re.data, '').split(re.sep);
                } else {
                    file = getPatchDir();
                    names = path.replace(re.patch, '').split(re.sep);
                }
                if (names && names.length) {
                    names.forEach(function(name) {
                        if (name) {
                            file.append(name);
                        }
                    });
                }
            } else if (re.defs.test(path)) {
                path = 'file:///' + path.replace(re.defs, function(all, name) {
                    return DirectoryService.get(name, IFile).path;
                }).replace(/\\/g, '/');
                file = getLocalFile(path);
            } else {
                file = getLocalFile(path);
            }
        }
        return file;
    },
    /**
     * 拡張(Tombloo)ディレクトリのファイルを返す
     * 通常このメソッドより assignLocalFile を使う
     *
     * @param  {String}      path  ファイルパス
     * @return {ILocalFile}        ファイルオブジェクト
     */
    getExtensionFile: function(path) {
        let file, dir, fileName, sep;
        sep = '/';
        file = getExtensionDir(EXTENSION_ID);
        dir = Pot.StringUtil.stringify(path).split(/[\/\\]/);
        fileName = dir.pop();
        while (dir && dir[dir.length - 1].length === 0) {
            dir.pop();
        }
        dir = dir.join(sep);
        file.setRelativeDescriptor(file, dir);
        file.append(fileName);
        return file;
    }
});


})();
//-----------------------------------------------------------------------------
// Pot.StringUtil - String utilities
//-----------------------------------------------------------------------------
(function() {


Pot.StringUtil = {};
Pot.extend(Pot.StringUtil, {
    /**
     * スカラー型となりうる値のみ文字列として評価する
     *
     * @param  {Mixed}   x   任意の値
     * @return {String}      文字列としての値
     */
    stringify: function(x) {
        var result = '';
        if (x !== null) {
            switch (typeof x) {
                case 'string':
                    result = x;
                    break;
                case 'xml':
                case 'number':
                    result = x.toString();
                    break;
                case 'boolean':
                    result = x ? 1 : '';
                    break;
                case 'object':
                    if (x && x.constructor === String) {
                        result = x;
                    }
                    break;
                default:
                    break;
            }
        }
        return String(result);
    },
    // Shortcut of String.fromCharCode() / charCodeAt(0)
    chr: function() {
        return String.fromCharCode.apply(null, Pot.ArrayUtil.flatten(Pot.ArrayUtil.toArray(arguments)).map(function(n) {
            return Pot.isNumeric(n) ? parseInt(n) : -1;
        }).filter(function(n) {
            return !isNaN(Number(n)) && Number(n) > -1;
        }));
    },
    ord: function(s) {
        return Pot.StringUtil.stringify(s).charCodeAt(0) || 0;
    },
    /**
     * 全角ホワイトスペースも含めたtrim
     */
    trim: function(s) {
        return Pot.StringUtil.stringify(s).replace(/^[\s\u00A0\u3000]+|[\s\u00A0\u3000]+$/g, '');
    },
    ltrim: function(s) {
        return Pot.StringUtil.stringify(s).replace(/^[\s\u00A0\u3000]+/g, '');
    },
    rtrim: function(s) {
        return Pot.StringUtil.stringify(s).replace(/[\s\u00A0\u3000]+$/g, '');
    },
    trimAll: function(s) {
        return Pot.StringUtil.stringify(s).replace(/[\s\u00A0\u3000]+/g, '');
    },
    mtrim: function(s) {
        return Pot.StringUtil.trim(s).replace(/^[\s\u00A0\u3000]+|[\s\u00A0\u3000]+$/gm, '');
    },
    mltrim: function(s) {
        return Pot.StringUtil.trim(s).replace(/^[\s\u00A0\u3000]+/gm, '');
    },
    mrtrim: function(s) {
        return Pot.StringUtil.trim(s).replace(/[\s\u00A0\u3000]+$/gm, '');
    },
    leftPad: function(val, size, ch) {
        let c, len, result = new String(Pot.StringUtil.stringify(val));
        c = Pot.StringUtil.stringify(ch) || ' ';
        len = size - 0;
        while (result.length < len) {
            result = c + result;
        }
        return result.toString();
    },
    /**
     * UTF-8 <-> UTF-16 相互変換
     *
     * RFC 2044, RFC 2279: UTF-8, a transformation format of ISO 10646
     *
     * encodeURIComponent/decodeURIComponent を使った UTF-8 変換は問題があり、
     * サロゲートペアや FFFE, FFFF の文字、URIError が発生するため推奨できない
     *
     * Example:
     *   decodeURIComponent(encodeURIComponent('\uFFFF')) === '\uFFFF';
     * Results:
     *   false (SpiderMonkey)
     *
     * Example:
     *   decodeURIComponent(encodeURIComponent('\uD811')) === '\uD811';
     * Results:
     *   URIError
     *
     * それらの問題を解消するためのメソッド。
     * それぞれ、unescape(encodeURIComponent(string)),
     * decodeURIComponent(escape(string)) と完全互換。
     */
    utf8: {
        encode: function(string) {
            var codes = [], i, len, c, s;
            s = new String(Pot.StringUtil.stringify(string));
            len = s.length;
            for (i = 0; i < len; i++) {
                c = s.charCodeAt(i);
                if (c < 0x80) {
                    codes[codes.length] = c;
                } else if (c > 0x7FF) {
                    codes.push(
                        0xE0 | ((c >> 12) & 0x0F),
                        0x80 | ((c >>  6) & 0x3F),
                        0x80 | ((c >>  0) & 0x3F)
                    );
                } else {
                    codes.push(
                        0xC0 | ((c >>  6) & 0x1F),
                        0x80 | ((c >>  0) & 0x3F)
                    );
                }
            }
            return String.fromCharCode.apply(null, codes);
        },
        decode: function(string) {
            var codes = [], i, len, s, n, c, c2, c3;
            s = new String(Pot.StringUtil.stringify(string));
            i = 0;
            len = s.length;
            while (i < len) {
                c = s.charCodeAt(i++);
                n = c >> 4;
                if (0 <= n && n <= 7) {
                    // 0xxxxxxx
                    codes[codes.length] = c;
                } else if (12 <= n && n <= 13) {
                    // 110x xxxx  10xx xxxx
                    c2 = s.charCodeAt(i++);
                    codes[codes.length] = ((c & 0x1F) << 6) | (c2 & 0x3F);
                } else if (n === 14) {
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    c2 = s.charCodeAt(i++);
                    c3 = s.charCodeAt(i++);
                    codes[codes.length] = ((c  & 0x0F) << 12) |
                                          ((c2 & 0x3F) <<  6) |
                                          ((c3 & 0x3F) <<  0);
                }
            }
            return String.fromCharCode.apply(null, codes);
        }
    },
    // Base64 from: http://feel.happy.nu/test/base64.html
    base64: (function() {
        var encode, decode, map;
        map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        encode = function(text) {
            var t = new String(''), s, p = -6, a = 0, i = 0, v = 0, c, n;
            s = Pot.StringUtil.utf8.encode(Pot.StringUtil.stringify(text));
            if (s) {
                n = s.length;
                while (i < n || p > -6) {
                    if (p < 0) {
                        if (i < n) {
                            c = s.charCodeAt(i++);
                            v += 8;
                        } else {
                            c = 0;
                        }
                        a = ((a & 255) << 8) | (c & 255);
                        p += 8;
                    }
                    t += map.charAt(v > 0 ? a >> p & 63 : 64);
                    p -= 6;
                    v -= 6;
                }
            }
            return t.toString();
        };
        decode = function(text) {
            var t = new String(''), s, p = -8, a = 0, c, d, i = 0, n;
            s = Pot.StringUtil.stringify(text);
            if (s) {
                n = s.length;
                for (; i < n; i++) {
                    c = map.indexOf(s.charAt(i));
                    if (c >= 0) {
                        a = (a << 6) | (c & 63);
                        if ((p += 6) >= 0) {
                            d = a >> p & 255;
                            if (c !== 64) {
                                t += String.fromCharCode(d);
                            }
                            a &= 63;
                            p -= 8;
                        }
                    }
                }
            }
            return Pot.StringUtil.utf8.decode(t.toString());
        };
        return {
            encode: function(text) {
                var result = '', s;
                s = Pot.StringUtil.stringify(text);
                if (s) {
                    try {
                        result = btoa(Pot.StringUtil.utf8.encode(s));
                    } catch (e) {
                        try {
                            result = encode(s);
                        } catch (e) {}
                    }
                }
                return result;
            },
            decode: function(text) {
                var result = '', s;
                s = Pot.StringUtil.stringify(text);
                if (s) {
                    try {
                        result = Pot.StringUtil.utf8.decode(atob(s));
                    } catch (e) {
                        try {
                            result = decode(s);
                        } catch (e) {}
                    }
                }
                return result;
            }
        };
    })(),
    /**
     * LZ77圧縮/解凍
     *
     * via AlphamericHTML
     *
     * http://nurucom-archives.hp.infoseek.co.jp/digital/
     * http://cgi.sippu.com/tool/AlphamericHTML/AlphamericHTML.html
     */
    AlphamericString: (function() {
        const ALPHAMERIC_BASE63TBL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_';
        return {
            encode: function(s) {
                var a = new String(''), c, i = 1014, j, K, k, L, l = -1, p, t = ' ', A, n;
                A = ALPHAMERIC_BASE63TBL.split(a);
                for (; i < 1024; i++) {
                    t += t;
                }
                t += Pot.StringUtil.stringify(s);
                while (p = t.substr(i, 64)) {
                    n = p.length;
                    for (j = 2; j <= n; j++) {
                        if (-1 === (k = t.substring(i - 819, i + j - 1).lastIndexOf(p.substring(0, j)))) {
                            break;
                        }
                        K = k;
                    }
                    if (2 === j || 3 === j && L === l) {
                        L = l;
                        if ((c = t.charCodeAt(i++)) < 128) {
                            if (L !== (l = (c - (c %= 32)) / 32 + 64)) {
                                a += A[l - 32];
                            }
                            a += A[c];
                        } else if (12288 <= c && c < 12544) {
                            if (L !== (l = ((c -= 12288) - (c %= 32)) / 32 + 68)) {
                                a += A[l - 32];
                            }
                            a += A[c];
                        } else if (65280 <= c && c < 65440) {
                            if (L !== (l = ((c -= 65280) - (c %= 32)) / 32 + 76)) {
                                a += A[l - 32];
                            }
                            a += A[c];
                        } else {
                            if (L !== (l = (c - (c %= 1984)) / 1984)) {
                                a += 'n' + A[l];
                            }
                            a += A[(c - (c %= 62)) / 62] + A[c];
                        }
                    } else {
                        a += A[(K - (K %= 63)) / 63 + 50] + A[K] + A[j - 3];
                        i += j - 1;
                    }
                }
                return a.toString();
            },
            decode: function(a) {
                var C = {}, c, i = 0, j, k, l, m, p, s = new String('    '), w, t = Pot.StringUtil.stringify(a);
                for (; i < 63; i++) {
                    C[ALPHAMERIC_BASE63TBL.charAt(i)] = i;
                }
                while (i -= 7) {
                    s += s;
                }
                while ((c = C[t.charAt(i++)]) < 63) {
                    if (c < 32) {
                        s += String.fromCharCode(m ? l * 32 + c : (l * 32 + c) * 62 + C[t.charAt(i++)]);
                    } else if (c < 49) {
                        l = (c < 36) ? c - 32 : (c < 44) ? c + 348 : c + 1996;
                        m = 1;
                    } else if (c < 50) {
                        l = C[t.charAt(i++)];
                        m = 0;
                    } else {
                        if (p = (w = s.slice(-819)).substring(k = (c - 50) * 63 + C[t.charAt(i++)], j = k + C[t.charAt(i++)] + 2)) {
                            while (w.length < j) {
                                w += p;
                            }
                        }
                        s += w.substring(k, j);
                    }
                }
                return s.slice(1024).toString();
            }
        };
    })(),
    /**
     * 32 ビット長の CRC (cyclic redundancy checksum) チェックサムを生成する
     *
     * @example  crc32('abc123');
     * @results  -821904548
     *
     * @param  {String}  string   データ
     * @return {Number}           CRC チェックサム
     */
    crc32: (function() {
        const tables = <>
            00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3
            0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91
            1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7
            136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5
            3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B
            35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59
            26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F
            2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D
            76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433
            7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01
            6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457
            65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65
            4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB
            4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9
            5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F
            5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD
            EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683
            E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1
            F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7
            FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5
            D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B
            D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79
            CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F
            C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D
            9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713
            95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21
            86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777
            88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45
            A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB
            AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9
            BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF
            B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D
        </>.toString().trim().split(/\s+/);
        return function(string) {
            var s, crc, x, y, i, x0, f, len;
            s = Pot.StringUtil.utf8.encode(Pot.StringUtil.stringify(string));
            f = -1;
            crc = x = y = 0;
            crc = crc ^ f;
            x0 = '0x';
            for (i = 0, len = s.length; i < len; i++) {
                y = (crc ^ s.charCodeAt(i)) & 0xff;
                x = x0 + tables[y];
                crc = (crc >>> 8) ^ x;
            }
            return crc ^ f;
        };
    })(),
    /**
     * 文字列をJavaScriptエスケープシーケンスとして評価できる値に変換
     * (JSONより多くの文字を変換する (i.e. JSONでも使える))
     *
     * @example  escapeSequence('ほげabc ("ｗ")');
     * @results  '\u307b\u3052abc\u0020(\"\uff57\")'
     *
     * @param  {String}   text   対象の文字列
     * @return {String}          変換された文字列
     */
    escapeSequence: function(text) {
        var s, re, meta, rep;
        re = /[^\w!#$()*+,.:;=?@[\]^`|~-]/gi;
        meta = {
            '\u0008': '\\b',  // 後退             <BS>
            '\u0009': '\\t',  // 水平タブ         <HT> <TAB>
            '\u000A': '\\n',  // 改行             <LF>
            '\u000B': '\\v',  // 垂直タブ         <VT>
            '\u000C': '\\f',  // 改ページ         <FF>
            '\u000D': '\\r',  // 復帰             <CR>
            '\u0027': '\\\'', // 単一引用符
            '\u0022': '\\"',  // 二重引用符
            '\u005C': '\\\\', // バックスラッシュ
            '\u002F': '\\/'   // スラッシュ
        };
        rep = function(a) {
            var c = meta[a];
            return typeof c === 'string' ? c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        };
        re.lastIndex = 0;
        s = Pot.StringUtil.stringify(text);
        return (s && re.test(s)) ? s.replace(re, rep) : s;
    },
    /**
     * JavaScriptエスケープシーケンスとして変換された文字列を元に戻す
     *
     * @example  escapeSequence('\\u307b\\u3052abc\\u0020(\\"\\uff57\\")');
     * @results  'ほげabc ("ｗ")'
     *
     * @param  {String}   text   対象の文字列
     * @return {String}          変換された文字列
     */
    unescapeSequence: function(text) {
        var s, re, meta, rep, chr;
        re = {
            seq: /\\([btnvfr'"\\\/]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.|[\s\S])/g,
            quote: /^\s*(?:"(?:\\.|[^"\n\\])*"|'(?:\\.|[^'\n\\])*')\s*$/,
            bs: /[\u005C]{2}/g
        };
        meta = {
            'b' : '\u0008',
            't' : '\u0009',
            'n' : '\u000A',
            'v' : '\u000B',
            'f' : '\u000C',
            'r' : '\u000D',
            '\'': '\u0027',
            '"' : '\u0022',
            '\\': '\u005C',
            '/' : '\u002F'
        };
        chr = String.fromCharCode;
        rep = function(m, a) {
            var r, c = meta[a];
            if (typeof c === 'string') {
                r = c;
            } else if (a.length === 3 && a.charAt(0) === 'x') {
                r = chr('0' + a);
            } else if (a.length === 5 && a.charAt(0) === 'u') {
                r = chr('0x' + a.substring(1));
            } else {
                r = a;
            }
            return r;
        };
        re.seq.lastIndex = 0;
        s = Pot.StringUtil.stringify(text);
        // JSON文字列の場合
        if (re.quote.test(s) && re.bs.test(s)) {
            s = s.replace(re.bs, '\u005C');
        }
        return (s && re.seq.test(s)) ? s.replace(re.seq, rep) : s;
    },
    /**
     * 文字列のByte数を取得
     *
     * @param  {String}   string   対象の文字列
     * @return {Number}            文字列のバイト数
     */
    getByteSize: function(string) {
        var size, i, s = Pot.StringUtil.stringify(string);
        try {
            size = Pot.StringUtil.utf8.encode(s).length;
        } catch (e) {
            // URIエラー回避
            try {
                size = s.split('').map(function(c) {
                    return c.charCodeAt(0) > 0xff ? 3 : 1;
                }).reduce(function(a, b) {
                    return a + b;
                });
            } catch (e) {
                try {
                    size = 0;
                    for (i = 0; i < s.length; ++i) {
                        size += s.charCodeAt(i) > 0xff ? 3 : 1;
                    }
                } catch (e) {
                    try {
                        size = encodeURIComponent(s).replace(/%../g, '?').length;
                    } catch (e) {
                        size = s && s.length || 0;
                    }
                }
            }
        }
        return Pot.isNumeric(size) ? size : 0;
    },
    // Hiragana/Katakana Library
    // Based: http://code.google.com/p/kanaxs/
    /**
     * 全角英数記号文字を半角英数記号文字に変換
     *
     * @example  toHankakuCase("Ｈｅｌｌｏ Ｗｏｒｌｄ！ １２３４５");
     * @results  "Hello World! 12345"
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        変換された文字列
     */
    toHankakuCase: function(text) {
        var r = [], c, s, i, len;
        s = Pot.StringUtil.stringify(text);
        if (s) {
            i = 0;
            len = s.length;
            while (i < len) {
                c = s.charCodeAt(i++);
                if (0xFF01 <= c && c <= 0xFF5E) {
                    c -= 0xFEE0;
                }
                r.push(c);
            }
        }
        return String.fromCharCode.apply(null, r);
    },
    /**
     * 半角英数記号文字を全角英数記号文字に変換
     *
     * @example  toZenkakuCase("Hello World! 12345");
     * @results  "Ｈｅｌｌｏ Ｗｏｒｌｄ！ １２３４５"
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        変換された文字列
     */
    toZenkakuCase: function(text) {
        var r = [], c, s, i, len;
        s = Pot.StringUtil.stringify(text);
        if (s) {
            i = 0;
            len = s.length;
            while (i < len) {
                c = s.charCodeAt(i++);
                if (0x21 <= c && c <= 0x7E) {
                    c += 0xFEE0;
                }
                r.push(c);
            }
        }
        return String.fromCharCode.apply(null, r);
    },
    /**
     * 全角スペースを半角スペースに変換
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        変換された文字列
     */
    toHanSpaceCase: function(text) {
        return Pot.StringUtil.stringify(text).replace(/[\u3000]/g, ' ');
    },
    /**
     * 半角スペースを全角スペースに変換
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        変換された文字列
     */
    toZenSpaceCase: function(text) {
        return Pot.StringUtil.stringify(text).replace(/[\u0020]/g, '\u3000');
    },
    /**
     * 全角カタカナを全角ひらがなに変換
     *
     * @example  toHiraganaCase("ボポヴァアィイゥウェエォオ");
     * @results  "ぼぽう゛ぁあぃいぅうぇえぉお"
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        ひらがなに変換された文字列
     */
    toHiraganaCase: function(text) {
        var r = [], c, i, s, len, code;
        s = Pot.StringUtil.stringify(text);
        if (s) {
            i = 0;
            len = s.length;
            while (i < len) {
                c = s.charCodeAt(i++);
                if (0x30A1 <= c && c <= 0x30F6) {
                    code = c - 0x0060;
                    // 「ヴ」を「う」+「゛」に変換する
                    if (c === 0x30F4) {
                        r.push(0x3046);
                        code = 0x309B;
                    }
                    c = code;
                }
                r.push(c);
            }
        }
        return String.fromCharCode.apply(null, r);
    },
    /**
     * 全角ひらがなを全角カタカナに変換
     *
     * @example  toKatakanaCase("ぼぽう゛ぁあぃいぅうぇえぉお");
     * @results  "ボポヴァアィイゥウェエォオ"
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        カタカナに変換された文字列
     */
    toKatakanaCase: function(text) {
        var r = [], c, d, i, code, len, s;
        s = Pot.StringUtil.stringify(text);
        if (s) {
            i = 0;
            len = s.length;
            while (i < len) {
                c = s.charCodeAt(i++);
                if (0x3041 <= c && c <= 0x3096) {
                    code = c + 0x0060;
                    if (i < len && c === 0x3046) {
                        d = s.charCodeAt(i);
                        if (d === 0x309B || d === 0xFF9E) {
                            // 「う」+「゛」を「ヴ」に変換する
                            code = 0x30F4;
                            i++;
                        }
                    }
                    c = code;
                }
                r.push(c);
            }
        }
        return String.fromCharCode.apply(null, r);
    },
    /**
     * 全角カタカナを半角ｶﾀｶﾅに変換
     *
     * @example  toHankanaCase("ボポヴァアィイゥウェエォオ");
     * @results  "ﾎﾞﾎﾟｳﾞｧｱｨｲｩｳｪｴｫｵ"
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        半角ｶﾀｶﾅに変換された文字列
     */
    toHankanaCase: (function() {
        var map = {
            0x30A1:0xFF67, 0x30A3:0xFF68, 0x30A5:0xFF69, 0x30A7:0xFF6A, 0x30A9:0xFF6B,
            0x30FC:0xFF70, 0x30A2:0xFF71, 0x30A4:0xFF72, 0x30A6:0xFF73, 0x30A8:0xFF74,
            0x30AA:0xFF75, 0x30AB:0xFF76, 0x30AD:0xFF77, 0x30AF:0xFF78, 0x30B1:0xFF79,
            0x30B3:0xFF7A, 0x30B5:0xFF7B, 0x30B7:0xFF7C, 0x30B9:0xFF7D, 0x30BB:0xFF7E,
            0x30BD:0xFF7F, 0x30BF:0xFF80, 0x30C1:0xFF81, 0x30C4:0xFF82, 0x30C6:0xFF83,
            0x30C8:0xFF84, 0x30CA:0xFF85, 0x30CB:0xFF86, 0x30CC:0xFF87, 0x30CD:0xFF88,
            0x30CE:0xFF89, 0x30CF:0xFF8A, 0x30D2:0xFF8B, 0x30D5:0xFF8C, 0x30D8:0xFF8D,
            0x30DB:0xFF8E, 0x30DE:0xFF8F, 0x30DF:0xFF90, 0x30E0:0xFF91, 0x30E1:0xFF92,
            0x30E2:0xFF93, 0x30E3:0xFF6C, 0x30E4:0xFF94, 0x30E5:0xFF6D, 0x30E6:0xFF95,
            0x30E7:0xFF6E, 0x30E8:0xFF96, 0x30E9:0xFF97, 0x30EA:0xFF98, 0x30EB:0xFF99,
            0x30EC:0xFF9A, 0x30ED:0xFF9B, 0x30EF:0xFF9C, 0x30F2:0xFF66, 0x30F3:0xFF9D,
            0x30C3:0xFF6F, 0x300C:0xFF62, 0x300D:0xFF63, 0x3002:0xFF61, 0x3001:0xFF64,
            0x30FB:0xFF65, 0x309B:0xFF9E, 0x309C:0xFF9F
        }, exc = {
            0x30F4:0xFF73, 0x30F7:0xFF9C, 0x30FA:0xFF66
        };
        return function(text) {
            var r = [], i, s, len, c;
            s = Pot.StringUtil.stringify(text);
            if (s) {
                i = 0;
                len = s.length;
                while (i < len) {
                    c = s.charCodeAt(i++);
                    if (c in map) {
                        r.push(map[c]);
                    } else if (c in exc) {
                        r.push(exc[c], 0xFF9E);
                    } else if (0x30AB <= c && c <= 0x30C9) {
                        r.push(map[c - 1], 0xFF9E);
                    } else if (0x30CF <= c && c <= 0x30DD) {
                        r.push(map[c - c % 3], [0xFF9E, 0xFF9F][c % 3 - 1]);
                    } else {
                        r.push(c);
                    }
                }
            }
            return String.fromCharCode.apply(null, r);
        }
    })(),
    /**
     * 半角ｶﾀｶﾅを全角カタカナに変換 (濁音含む)
     *
     * @example  toZenkanaCase("ﾎﾞﾎﾟｳﾞｧｱｨｲｩｳｪｴｫｵ");
     * @results  "ボポヴァアィイゥウェエォオ"
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        全角カタカナに変換された文字列
     */
    toZenkanaCase: (function() {
        var maps = [
            // Unicode U+FF61 - U+FF9F Mapping
            0x3002, 0x300C, 0x300D, 0x3001, 0x30FB, 0x30F2, 0x30A1, 0x30A3,
            0x30A5, 0x30A7, 0x30A9, 0x30E3, 0x30E5, 0x30E7, 0x30C3, 0x30FC,
            0x30A2, 0x30A4, 0x30A6, 0x30A8, 0x30AA, 0x30AB, 0x30AD, 0x30AF,
            0x30B1, 0x30B3, 0x30B5, 0x30B7, 0x30B9, 0x30BB, 0x30BD, 0x30BF,
            0x30C1, 0x30C4, 0x30C6, 0x30C8, 0x30CA, 0x30CB, 0x30CC, 0x30CD,
            0x30CE, 0x30CF, 0x30D2, 0x30D5, 0x30D8, 0x30DB, 0x30DE, 0x30DF,
            0x30E0, 0x30E1, 0x30E2, 0x30E4, 0x30E6, 0x30E8, 0x30E9, 0x30EA,
            0x30EB, 0x30EC, 0x30ED, 0x30EF, 0x30F3, 0x309B, 0x309C
        ];
        return function(text) {
            var code, codes = [], i, len, s, c, next, last;
            s = Pot.StringUtil.stringify(text);
            if (s) {
                len = s.length;
                last = len - 1;
                for (i = 0; i < len; i++) {
                    c = s.charCodeAt(i);
                    // 半角カタカナの範囲
                    if (c > 0xFF60 && c < 0xFFA0) {
                        code = maps[c - 0xFF61];
                        if (i < last) {
                            next = s.charCodeAt(++i);
                            // 濁音「ﾞ」 + 「ヴ」
                            if (next === 0xFF9E && c === 0xFF73) {
                                code = 0x30F4;
                            // 濁音「ﾞ」 + 「カ」～「コ」 or 「ハ」～「ホ」
                            } else if (next === 0xFF9E &&
                                        ((c > 0xFF75 && c < 0xFF85) ||
                                         (c > 0xFF89 && c < 0xFF8F))) {
                                code++;
                            // 濁音「ﾟ」 + 「ハ」～「ホ」
                            } else if (next === 0xFF9F &&
                                        (c > 0xFF89 && c < 0xFF8F)) {
                                code += 2;
                            } else {
                                i--;
                            }
                        }
                        c = code;
                    }
                    codes.push(c);
                }
            }
            return String.fromCharCode.apply(null, codes);
        }
    })(),
    /**
     * アルファベットと数字[a-zA-Z0-9]をひらがなの読みに変換
     *
     * @example  toHirayomiCase('abC');
     * @results  'えーびーしー'
     *
     * @param  {String}  text  変換対象の文字列
     * @return {String}        英字がひらがなの読みに変換された文字列
     */
    toHirayomiCase: (function() {
        var enMaps, romaMaps, numberMaps, toNumberReading;
        romaMaps = {
            // ちょっとおバカな読み方
            a: 'えー', b: 'びー',   c: 'しー', d: 'でぃー', e: 'いー',       f: 'えふ',
            g: 'じー', h: 'えいち', i: 'あぃ', j: 'じぇい', k: 'けぃ',       l: 'える',
            m: 'えむ', n: 'えぬ',   o: 'おー', p: 'ぴー',   q: 'きゅー',     r: 'あーる',
            s: 'えす', t: 'てぃー', u: 'ゆー', v: 'ぶぃ',   w: 'だぶりゅー', x: 'えっくす',
            y: 'わぃ', z: 'ぜっと'
        };
        enMaps = {
            // 辞書的なもの
            hello: 'はろー', world: 'わーるど', you: 'ゆー', are: 'あー', he: 'ひー',
            she: 'しー', that: 'ざっと', is: 'いず', am: 'あむ', we: 'うぃ', by: 'ばぃ',
            'if': 'いふ', on: 'おん', 'in': 'いん', so: 'そー', your: 'ゆあ', not: 'のっと',
            at: 'あっと', 'for': 'ふぉー', to: 'とぅー', it: 'いっと', "it's": 'いっつ',
            "i'm": 'あいむ', "don't": 'どんと', of: 'おぶ', 'do': 'どぅー', lol: 'わら',
            fuck: 'ふぁっく', shit: 'しっと', be: 'びー',
            google: 'ぐーぐる', yahoo: 'やふー', twitter: 'ついったー', tumblr: 'たんぶらー',
            facebook: 'ふぇいすぶっく', amazon: 'あまぞん'
        };
        numberMaps = {
            0: 'ぜろ', 1: 'いち', 2: 'に',   3: 'さん', 4: 'よん',
            5: 'ご',   6: 'ろく', 7: 'なな', 8: 'はち', 9: 'きゅー'
        };
        // すごく遠回りな変換..
        toNumberReading = function(number) {
            var result = [], nread, dread, nums, maps, prev, dec;
            if (/^\d+$/.test(number)) {
                if (number == 0) {
                    result = [numberMaps[number]];
                } else {
                    maps = update({}, numberMaps);
                    maps[0] = '';
                    nums = number.toString().split('');
                    while (n = nums.shift()) {
                        n = Number(n);
                        nread = '';
                        dread = n >= 1 ? maps[n] : '';
                        switch (nums.length + 1) {
                            case 1:
                                nread = '';
                                break;
                            case 2:
                                nread = 'じゅう';
                                dread = n >= 2 ? maps[n] : '';
                                break;
                            case 3:
                                nread = 'ひゃく';
                                dread = n >= 2 ? maps[n] : '';
                                switch (n) {
                                    case 3:
                                        nread = 'び' + nread.substring(1);
                                        break;
                                    case 6:
                                    case 8:
                                        nread = 'ぴ' + nread.substring(1);
                                        dread = dread.charAt(0) + 'っ';
                                        break;
                                    default:
                                        break;
                                }
                                break;
                            case 4:
                                nread = 'せん';
                                dread = n >= 2 ? maps[n] : '';
                                switch (n) {
                                    case 3:
                                        nread = 'ぜ' + nread.substring(1);
                                        break;
                                    case 8:
                                        dread = dread.charAt(0) + 'っ';
                                        break;
                                    default:
                                        break;
                                }
                                break;
                            case 5:
                                nread = 'まん';
                                break;
                            case 6:
                                nread = 'おく';
                                break;
                            case 7:
                                nread = 'ちょう';
                                break;
                            case 8:
                                nread = 'けい';
                                break;
                            case 9:
                                nread = 'がい';
                                break;
                            case 10:
                                nread = 'じょ';
                                break;
                            case 11:
                                nread = 'じょう';
                                break;
                            case 12:
                                nread = 'こう';
                                break;
                            default:
                                nread = '';
                                dread = maps[n];
                                break;
                        }
                        dec = dread + nread;
                        if (n == 0 && prev) {
                            nread = '';
                            dec = dread;
                        }
                        prev = {
                            n: nread,
                            d: dread
                        };
                        result.push(dec);
                    }
                }
            }
            return result.join('');
        };
        return function(text) {
            var result = [], chars, c, s, i, len, translate;
            translate = function(a) {
                var r, b;
                if (/^\d{2,}$/.test(a)) {
                    r = toNumberReading(a);
                } else {
                    b = String(a).toLowerCase();
                    r = enMaps[b] || romaMaps[b] || numberMaps[b] || a;
                }
                return r;
            };
            s = Pot.StringUtil.stringify(text);
            if (s) {
                chars = s.split(/\b/);
                len = chars.length;
                for (i = 0; i < len; i++) {
                    c = chars[i];
                    result.push(translate(c));
                }
                s = result.join('');
                result = [];
                chars = s.split('');
                len = chars.length;
                for (i = 0; i < len; i++) {
                    c = chars[i];
                    result.push(translate(c));
                }
            }
            return result.join('');
        };
    })(),
    /**
     * 2ch系のログテキストの名前/IDの行を除去して返す
     *
     * ↓こんな行
     *  5：以下、名無しにかわりましてVIPがお送りします：0000/00/00(日) 00:00:00.00 ID:xxxxxxxxx
     *
     * @param  {String}  text  対象のテキスト
     * @return {String}        除去したテキスト
     */
    remove2chName: function(text) {
        let s, tpls, patterns, re = {
            colon: '[：:]',
            space: '[\\u0009\\u0020\\u3000]*',
            open: '[（(]',
            close: '[)）]',
            day: '[月火水木金土日]',
            id: 'ID:[a-zA-Z0-9_./=+-]{9}',
            number: '[0-9]',
            numbers: '[1-9][0-9]',
            name: '.*?',
            be: '[\\u0020-\\u007F]{0,39}'
        };
        s = Pot.StringUtil.stringify(text);
        tpls = [{
            format: '^ %s{0,3} %s %s %s %s{3}/%s{2}/%s{2} %s %s %s %s{2}:%s{2}:%s{2}(?:[.]%s{1,2}|) %s%s$',
            flags: 'gim'
        }, {
            format: '(?:\\b|) %s{0,3} %s %s %s %s{3}/%s{2}/%s{2} %s %s %s %s{2}:%s{2}:%s{2}(?:[.]%s{1,2}|) %s%s?' +
                    '(?=[\\u0100-\\uFFFF]|[\\r\\n]|\\b|$|)',
            flags: 'gi'
        }];
        patterns = [];
        tpls.forEach(function(tpl) {
            patterns.push(new RegExp(
                Pot.sprintf(
                    tpl.format,
                    re.numbers, re.colon, re.name, re.colon, re.numbers, re.number, re.number,
                    re.open, re.day, re.close,re.number, re.number, re.number, re.number, re.id, re.be
                ).replace(/\s+/g, re.space),
                tpl.flags
            ));
        });
        patterns.forEach(function(pattern) {
            s = s.replace(pattern, '');
        });
        return s;
    },
    /**
     * HTML/XMLタグを除去
     *
     * @param  {String}  text  対象の文字列
     * @return {String}        タグが除去された文字列
     */
    stripTags: function(text) {
        var s, prev, limit = 5;
        while (--limit >= 0) {
            s = Pot.StringUtil.stringify(text).
                replace(/<([%?])[\s\S]*?\1>/g, '').
                replace(/<!--[\s\S]*?-->/g, '').
                replace(/<!-*\[CDATA\[[\s\S]*?\]\]-*>/gi, '').
                replace(/<!\s*\w+[^>]*>/g, '').
                replace(/<\s*(\w+)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/g, ' $2 ').
                replace(/<\s*\/?\s*\w+\b[^>]*>/g, ' ').
                replace(/<[^>]*>/g, ' ');
            if (prev === s) {
                break;
            }
            prev = s;
        }
        return s;
    },
    /**
     * 半角スペースに統一
     *
     * @param  {String}  text      対象の文字列
     * @param  {Number}  tabWidth  タブをスペースいくつにするか (default=4)
     * @return {String}            半角スペースに統一された文字列
     */
    normalizeSpace: function(text, tabWidth) {
        return Pot.StringUtil.stringify(text).
            replace(/[\u3000\u00A0]/g, ' ').
            replace(/[\u0009]/g, new Array((tabWidth || 4) + 1).join(' '));
    },
    /**
     * すべてのホワイトスペース(改行含む)をスペース1つに統一
     *
     * @param  {String}  text  対象の文字列
     * @return {String}        変換された文字列
     */
    spacerize: function(text) {
        return Pot.StringUtil.trim(Pot.StringUtil.stringify(text).split(/[\s\u00A0\u3000]+/).join(' '));
    },
    /**
     * ホワイトスペースで区切って適度に改行を入れる
     *
     * @param  {String}  text      対象の文字列
     * @param  {Number}  lineSize  1行の長さ (default=79～120)
     * @return {String}            変換された文字列
     */
    wrapBySpace: function(text, lineSize) {
        var result, line, lines = [], size, getSize, re;
        size = Number((Pot.isNumeric(lineSize) && Number(lineSize) > 0) ? lineSize - 0 : -1);
        getSize = function() {
            return size <= 0 ? Pot.rand(79, 120) : size;
        };
        re = {
            div: /[\s\u00A0\u3000]+/g,
            end: /(?:[,，.．､、｡。!！?？]|\b|)$/g
        };
        result = Pot.StringUtil.stringify(text).split(re.div).reduce(function(a, b) {
            var space = ' ';
            if (Pot.StringUtil.getByteSize(a.split('\n').pop()) > getSize() && re.end.test(a)) {
                space = '\n';
            }
            return [a, b].join(space);
        });
        return Pot.StringUtil.trim(result);
    },
    /**
     * URI/Entity/Esc等を除去
     *
     * @param  {String}  text  対象の文字列
     * @return {String}        ノイズを除去した文字列
     */
    removeNoise: function(text) {
        return Pot.StringUtil.stringify(text).
            // URIをドメイン名のみに変換
            replace(/(?:h?ttp|ftp|rsync|nntp)s?:\/{0,}([\w.-]+)/gi, '$1').
            // 他のURIは除去
            replace(/[a-zA-Z]\w*:\/+[-_.!~*'()a-zA-Z0-9;\/?:@&=+$,%#]+/g, ' ').
            replace(/[a-zA-Z]\w*:\/+[\u0021-\u007E]{0,256}/g, ' ').
            replace(/[a-zA-Z]\w*:(?:\s{1}|[\u0021-\u007E]{0,256})/g, ' ').
            replace(/[%\\](?:u[a-f0-9]{4}|x?[a-f0-9]{2})/gi, ' ').
            replace(/&(?:[a-z]|#x?)\w+;/gi, ' ').
            replace(/[\u0000-\u0008]/g, ' ');
    },
    /**
     * AA(アスキーアート)を除去。他にも顔文字やソースコードなどを除去する
     *
     * @param  {String}  text  対象の文字列
     * @return {String}        AAなどが除去された文字列
     */
    removeAA: function(text) {
        var patterns, func;
        patterns = {
            replace: /^([^\r\n]+)$/igm,
            space: /[\u0009\u0020\u3000]{2,}/g,
            word: /[\w一-龠々〆ヵヶぁ-んァ-ヴｦ-ｯｱ-ﾝﾞ゛ﾟ゜ａ-ｚＡ-Ｚ,，.．､、｡。!！?？\u301Cー～－ｰ-]/,
            text: /[a-zA-Zぁ-んァ-ヴｦ-ｯｱ-ﾝﾞ゛ﾟ゜・･\u301Cー～－ｰ-]/,
            hira: /[ぁ-ん]/
        };
        func = function(m0, m1) {
            var result, s, words, prev, wc, chars, per, meas, items, clean;
            clean = function(a) {
                var r = [];
                (' ' + a).split(patterns.space).forEach(function(v) {
                    if (v.length >= 2 && patterns.text.test(v)) {
                        r.push(v);
                    }
                });
                return r.join(' ');
            };
            s = String(m1);
            if (patterns.space.test(s)) {
                // 空白が多い(AA): 50% 以上単語がなければ AA or 顔文字 or コード等とする
                meas = 50;
                s = s.replace(patterns.space, ' ');
            } else {
                // 通常のテキスト: 30% 以上単語がなければ ソースコードなどとする
                meas = 30;
            }
            chars = s.split('');
            prev = null;
            idx = 0;
            words = [];
            // AA の中のセリフを抽出する。スペースや記号を挟んで複数ある場合も考慮
            words[idx] = [];
            wc = 0;
            chars.forEach(function(v, i) {
                if (patterns.word.test(v)) {
                    wc++;
                    if (prev === null || prev === i - 1) {
                        words[idx].push(v);
                        prev = i;
                    } else if (words[idx].length > 0) {
                        idx++;
                        words[idx] = [];
                        prev = null;
                    }
                }
            });
            // 単語の割合が一定数以上なら通常テキスト。それ以外は AA or 顔文字 or コード とする
            per = Math.floor(wc / chars.length * 100);
            if (per > meas) {
                // 通常のテキスト (記号のみの顔文字らしき文字列は除去する)
                result = clean(String(m1));
            } else {
                // AA もしくは顔文字、ソースコード等。
                // 記号として用いられるひらがなや漢字、英字が残る可能性がある
                items = [];
                words.forEach(function(v) {
                    var uniqLen = v.length >= 5 ? 5 : Math.max(1, Math.floor(v.length / 2));
                    if (v.length >= 2 && patterns.hira.test(v.join('')) && Pot.ArrayUtil.unique(v).length > uniqLen) {
                        items.push(v.join(''));
                    }
                });
                result = clean(items.join(' '));
            }
            return result;
        };
        return Pot.StringUtil.stringify(text).replace(patterns.replace, func);
    }
});


})();
//-----------------------------------------------------------------------------
// Pot.ArrayUtil - Array utilities
//-----------------------------------------------------------------------------
(function() {


Pot.ArrayUtil = {};
Pot.extend(Pot.ArrayUtil, {
    toArray: function(a) {
        return Array.prototype.slice.call(a);
    },
    indexOf: function(array, value, loose) {
        var exists, i, len;
        if (Pot.isArray(array)) {
            i = 0;
            len = array.length;
            do {
                exists = (loose && array[i] == value) || array[i] === value;
            } while (++i < len && !exists);
        }
        return exists ? i - 1 : -1;
    },
    emptyFilter: function(array) {
        return Pot.ArrayUtil.toArray(array).filter(function(v) {
            return v && v.length > 0;
        });
    },
    /**
     * 多次元配列を1次元配列に変換
     *
     * @example  flatten([1,2,3,[4,5,6,[7,8,[9],10],11],12])
     * @results  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
     *
     * @param  {Array}   array   a target array
     * @return {Array}           an array which has only one dimension
     */
    flatten: function(array) {
        var result = [], self = arguments.callee, i, len, item, items,
            toString = Object.prototype.toString, isIterable = function(v) {
            return (v instanceof Array) ||
                    v.callee || /List|Collection/i.test(toString.call(v)) ||
                    ((v.nextNode || v.item) &&
                    toString.call(v.length) === '[object Number]');
        };
        if (!isIterable(array)) {
            result.push(array);
        } else {
            items = Array.prototype.slice.call(array, 0);
            i = 0;
            len = items.length;
            do {
                item = items[i];
                if (isIterable(item)) {
                    Array.prototype.push.apply(result, self.call(self, item));
                } else {
                    result.push(item);
                }
            } while (++i < len);
        }
        return result;
    },
    /**
     * 与えられた配列をユニークにした配列を返す (ソートなしで順序を保つ)
     *
     * @param  {Array}    array       対象の配列 (この配列に変化は生じない)
     * @param  {Boolean}  loose       緩い比較(==)をする場合 true, デフォルトは厳密な比較(===)
     * @param  {Boolean}  ignoreCase  大文字小文字を区別しない場合 true を渡す
     * @return {Array}                ユニークな値を持つ配列
     */
    unique: function(array, loose, ignoreCase) {
        var result = [], i, j, len, dups = [], ia, ja, strict;
        if (Pot.isArray(array)) {
            len = array.length;
            strict = ignoreCase ? true : !loose;
            for (i = 0; i < len; ++i) {
                for (j = i + 1; j < len; ++j) {
                    if (ignoreCase) {
                        ia = String(array[i]).toLowerCase();
                        ja = String(array[j]).toLowerCase();
                    } else {
                        ia = array[i];
                        ja = array[j];
                    }
                    if ((strict && ia === ja ) || (ia == ja)) {
                        dups[j] = i;
                    }
                }
                if (!(i in dups)) {
                    result.push(array[i]);
                }
            }
        }
        return result;
    },
    /*
     * 配列に新たな配列を追加する
     *
     * @param  {Array}  ...  追加する配列
     * @return {Array}       マージされた配列
     */
    merge: function() {
        var args = Pot.ArrayUtil.toArray(arguments);
        return Array.prototype.concat.apply([], args);
    },
    uniqueMerge: function() {
        var i, j, k, add, result = [], tags, tag, args = Pot.ArrayUtil.toArray(arguments);
        for (i = 0; i < args.length; i++) {
            tags = args[i];
            if (Pot.isArray(tags)) {
                add = true;
                for (j = 0; j < tags.length; j++) {
                    tag = tags[j];
                    for (k = 0; k < result.length; k++) {
                        if (tag == result[k]) {
                            add = false;
                            break;
                        }
                    }
                    if (add) {
                        result.push(tag);
                    }
                }
            }
        }
        return result;
    },
    diff: function(base, diff) {
        var i, j, add, result = [];
        if (Pot.isArray(base)) {
            diff = Pot.isArray(diff) ? diff : [];
            for (i = 0; i < base.length; i++) {
                add = true;
                for (j = 0; j < diff.length; j++) {
                    if (diff[j] == base[i]) {
                        add = false;
                        break;
                    }
                }
                if (add) {
                    result.push(base[i]);
                }
            }
        }
        return result;
    },
    /**
     * ヒューマンライクなソート (natural sort)
     *
     * Based: http://www.davekoelle.com/alphanum.html
     *
     * @example   alphanumSort(['a10', 'a2', 'a100', 'a1', 'a12']);
     * @results   ['a1', 'a2', 'a10', 'a12', 'a100']
     *
     * @param  {Array}    array            対象の配列
     * @param  {Boolean}  caseInsensitive  大文字小文字を区別しない
     * @return {Array}                     ソートされた配列 (引数そのもの)
     */
    alphanumSort: function(array, caseInsensitive) {
        var z, t, x, y, n, i, j, m, h;
        if (array && Pot.isArray(array)) {
            for (z = 0; t = array[z]; z++) {
                array[z] = [];
                x = n = 0;
                y = -1;
                while (i = (j = t.charAt(x++)).charCodeAt(0)) {
                    m = (i === 46 || (i >= 48 && i <= 57));
                    if (m !== n) {
                        array[z][++y] = '';
                        n = m;
                    }
                    array[z][y] += j;
                }
            }
            array.sort(function(a, b) {
                var x, aa, bb, c, d;
                for (x = 0; (aa = a[x]) && (bb = b[x]); x++) {
                    if (caseInsensitive) {
                        aa = aa.toLowerCase();
                        bb = bb.toLowerCase();
                    }
                    if (aa !== bb) {
                        c = Number(aa);
                        d = Number(bb);
                        if (c == aa && d == bb) {
                            return c - d;
                        } else {
                            return (aa > bb) ? 1 : -1;
                        }
                    }
                }
                return a.length - b.length;
            });
            for (z = 0, h = array.length; z < h; z++) {
                array[z] = array[z].join('');
            }
        }
        return array;
    }
});


})();
//-----------------------------------------------------------------------------
// Pot.mimeType(s) - MIME Type
//-----------------------------------------------------------------------------
(function() {
/**
 * MIME Types
 * navigator.mimeTypesが挙動不審なのでべたで定義することにした
 * MimeTypeオブジェクトの取得方法がわかれば楽なんだけど...
 */
Pot.extend({
    mimeType: {
        /**
         * MIME Type から拡張子を取得
         *
         * @example getExt('application/javascript');
         * @results 'js'
         *
         * @param  {String}  type   MIME Type
         * @return {String}         拡張子 or undefined
         */
        getExt: function(type) {
            let r, p, s, o, m = Pot.mimeTypes, t = Pot.StringUtil.stringify(type);
            if (t) {
                t = t.toLowerCase();
                for (p in m) {
                    s = String(m[p]).toLowerCase();
                    if (s === t) {
                        r = s;
                        break;
                    }
                }
                if (!r && window.navigator && window.navigator.mimeTypes) {
                    o = window.navigator.mimeTypes[t];
                    if (o && o.suffixes) {
                        r = String(o.suffixes).split(/[\s,.*]+/).join(' ').split(' ').shift();
                    }
                }
             }
             return r;
        },
        /**
         * 拡張子から MIME Type を取得
         *
         * @example getType('js');
         * @results 'application/javascript'
         *
         * @param  {String}   ext   拡張子
         * @return {String}         MIME Type, or undefined
         */
        getType: function(ext) {
            let r, t, o, p, m, g;
            t = Pot.StringUtil.stringify(ext).toLowerCase();
            r = Pot.mimeTypes[t];
            if (!r && window.navigator && window.navigator.mimeTypes) {
                m = window.navigator.mimeTypes;
                g = new RegExp(t.wrap('\\b'), 'i');
                for (p in m) {
                    if (m[p] && g.test(m[p].suffixes)) {
                        r = m[p].type;
                        break;
                    }
                }
            }
            return r;
        }
    },
    mimeTypes: {
        // text/basic
        txt  : 'text/plain',
        html : 'text/html',
        htm  : 'text/html',
        php  : 'text/html',
        css  : 'text/css',
        js   : 'application/javascript',
        json : 'application/json',
        xml  : 'application/xml',
        swf  : 'application/x-shockwave-flash',
        flv  : 'video/x-flv',
        rdf  : 'application/rdf+xml',
        xul  : 'application/vnd.mozilla.xul+xml',
        // images
        png  : 'image/png',
        jpg  : 'image/jpeg',
        jpe  : 'image/jpeg',
        jpeg : 'image/jpeg',
        gif  : 'image/gif',
        bmp  : 'image/bmp',
        ico  : 'image/vnd.microsoft.icon',
        tiff : 'image/tiff',
        tif  : 'image/tiff',
        svg  : 'image/svg+xml',
        svgz : 'image/svg+xml',
        // archives
        zip  : 'application/zip',
        rar  : 'application/x-rar-compressed',
        msi  : 'application/x-msdownload',
        exe  : 'application/x-msdownload',
        cab  : 'application/vnd.ms-cab-compressed',
        jar  : 'application/java-archive',
        lzh  : 'application/x-lzh-compressed',
        lha  : 'application/x-lzh-compressed',
        afa  : 'application/x-astrotite-afa',
        z    : 'application/x-compress',
        taz  : 'application/x-compress',
        bz2  : 'application/x-bzip',
        gz   : 'application/x-gzip',
        tgz  : 'application/x-gzip',
        tar  : 'application/x-tar',
        '7z' : 'application/x-7z-compressed',
        // audio/video
        au   : 'audio/basic',
        snd  : 'audio/basic',
        aif  : 'audio/x-aiff',
        aiff : 'audio/x-aiff',
        aifc : 'audio/x-aiff',
        m3u  : 'audio/x-mpegurl',
        ram  : 'audio/x-pn-realaudio',
        ra   : 'audio/x-pn-realaudio',
        rm   : 'application/vnd.rn-realmedia',
        wav  : 'audio/x-wav',
        midi : 'audio/midi',
        mid  : 'audio/midi',
        kar  : 'audio/midi',
        mp3  : 'audio/mpeg',
        mp2  : 'audio/mpeg',
        mpga : 'audio/mpeg',
        mp4  : 'video/mp4',
        mov  : 'video/quicktime',
        qt   : 'video/quicktime',
        mpeg : 'video/mpeg',
        mpg  : 'video/mpeg',
        mpe  : 'video/mpeg',
        mxu  : 'video/vnd.mpegurl',
        m4u  : 'video/vnd.mpegurl',
        avi  : 'video/x-msvideo',
        // adobe
        pdf  : 'application/pdf',
        psd  : 'image/vnd.adobe.photoshop',
        ps   : 'application/postscript',
        ai   : 'application/postscript',
        eps  : 'application/postscript',
        // ms office
        doc  : 'application/msword',
        rtf  : 'application/rtf',
        xls  : 'application/vnd.ms-excel',
        ppt  : 'application/vnd.ms-powerpoint',
        // open office
        odt  : 'application/vnd.oasis.opendocument.text',
        ods  : 'application/vnd.oasis.opendocument.spreadsheet'
    }
});


})();
//-----------------------------------------------------------------------------
// Pot.ProgressDialog - ProgressMeter
//-----------------------------------------------------------------------------
(function() {

// Tombloo::Progress では進歩状況としての文字列を表示する要素がなかったため定義
Pot.ProgressDialog = (function() {
    let xul, script;
    script = Pot.StringUtil.stringify(<><![CDATA[
        var args = arguments[0], progress, status, dialog, listener;
        listener = {
            loaded: false,
            window: window,
            parent: null,
            dialog: null,
            onCancel: function(event) {
                this.parent.onCancel(event);
            },
            updateState: function(o) {
                if (o) {
                    if (o.title) {
                        try {
                            document.title = o.title;
                        } catch (e) {}
                    }
                    if (o.status) {
                        status.value = o.status;
                    }
                }
            }
        };
        window.addEventListener('load', function() {
            progress = byId('progress');
            status = byId('status');
            dialog = byId('dialog');
            listener.parent = args.that;
            listener.dialog = dialog;
            listener.loaded = true;
            args.referListener.call(args.that, listener);
        }, true);
        
        window.addEventListener('dialogcancel', function(event) {
            listener.onCancel(event);
        }, true);
        
        function byId(id) {
            return document.getElementById(id);
        }
    ]]></>);
    xul = Pot.StringUtil.mltrim(Pot.StringUtil.trim(<><![CDATA[
        <?xml version="1.0" encoding="utf-8"?>
        <?xml-stylesheet type="text/css" href="chrome://global/skin/"?>
        <?xml-stylesheet type="text/css" href="chrome://global/skin/global.css"?>
        <dialog xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
                width="400" 
                height="170" 
                id="dialog" 
                style="padding: 0.6em;"
                {BUTTONS}>
            <spacer height="5"/>
            <progressmeter id="progress" mode="undetermined"/>
            <textbox id="status" rows="2" flex="1"
                     multiline="true" readonly="true" value=""
                     style="-moz-appearance: none; border: none;"/>
            <script>{SCRIPT}</script>
        </dialog>
    ]]></>).split('{SCRIPT}').join(['<![CDATA[', script, ']]>'].join('\n')));
    
    function ProgressDialog(title, status, useCancel) {
        return new arguments.callee.prototype.init(title, status, useCancel);
    }
    ProgressDialog.prototype = {
        title: null,
        status: null,
        canceled: false,
        useCancel: false,
        listener: {},
        init: function(title, status, useCancel) {
            this.setTitle(title);
            this.setStatus(status);
            this.useCancel = !!useCancel;
            return this;
        },
        open: function(title, status, useCancel) {
            let self = this, len = arguments.length, args, data, rep;
            if (len >= 1) {
                this.setTitle(title);
            }
            if (len >= 2) {
                this.setStatus(status);
            }
            if (len >= 3) {
                this.useCancel = !!useCancel;
            }
            args = {
                that: this,
                title: this.title,
                status: this.status,
                referListener: this.referListener
            };
            data = String(xul);
            if (this.useCancel) {
                rep = 'buttons="cancel" buttonlabelcancel="Cancel"';
            } else {
                rep = 'buttons=","';
            }
            data = data.replace('{BUTTONS}', rep);
            openDialog(
                Pot.toDataURI.encodeURI(data, 'xul', 'utf-8'),
                Pot.implode({
                    chrome       : 'yes',
                    alwaysRaised : 'yes',
                    resizable    : 'yes',
                    centerscreen : 'yes',
                    dependent    : 'yes',
                    titlebar     : 'yes',
                    close        : 'yes'
                }, '=', ','),
                args
            );
            till(function() {
                return self.listener && self.listener.loaded;
            });
            this.update();
            return this;
        },
        close: function() {
            try {
                this.listener.dialog.cancelDialog();
            } catch (e) {
                try {
                    this.listener.window.close();
                } catch (e) {}
            }
        },
        setTitle: function(title) {
            if (title !== undefined) {
                this.title = Pot.StringUtil.stringify(title);
            }
            return this;
        },
        setStatus: function(status) {
            if (status !== undefined) {
                this.status = Pot.StringUtil.stringify(status);
            }
            return this;
        },
        update: function(status) {
            this.setStatus(status);
            this.updateState();
            return this;
        },
        referListener: function(listener) {
            this.listener = listener;
            return this;
        },
        onCancel: function(event) {
            this.canceled = true;
            this.close();
        },
        updateState: function() {
            this.listener.updateState({
                title: this.title,
                status: this.status
            });
            return this;
        }
    };
    ProgressDialog.prototype.init.prototype = ProgressDialog.prototype;
    return ProgressDialog;
})();


})();
//-----------------------------------------------------------------------------
// テキスト要約/形態素解析オブジェクト
//-----------------------------------------------------------------------------
(function() {

Pot.extend({
    /**
     * マルコフ連鎖で文章を要約
     */
    MarkovChainer: (function() {
        const MARKOV_START = '\u0000';
        const MARKOV_END   = '\u0001';
        const MARKOV_SYMBOL_PATTERN = /[\u0000-\u0008]+/g;
        var MarkovChainer = function() {
            return new arguments.callee.prototype.init();
        };
        MarkovChainer.prototype = {
            constructor: MarkovChainer,
            isMarkovChainer: true,
            dics: null,
            START: MARKOV_START,
            END: MARKOV_END,
            SYMBOL_PATTERN: MARKOV_SYMBOL_PATTERN,
            init: function() {
                return this.clear();
            },
            clear: function() {
                this.dics = null;
                return this;
            },
            createDics: function() {
                return new Pot.Hash();
            },
            /**
             * 文章を要約
             *
             * @param  {String}   text  対象のテキスト
             * @return {String}         要約した文章
             */
            summarize: function(text) {
                let s, result = '';
                s = this.removeSymbols(this.stringify(text));
                if (s) {
                    this.dics = this.createDics();
                    this.learn(s);
                    result = this.chain2();
                }
                return this.stringify(result);
            },
            /**
             * マルコフ連鎖で文章作成
             * (2階マルコフ連鎖: second-order Markov process)
             *
             * @return {String}  生成した文字列
             */
            chain2: function() {
                let self = this, result = '', c1, c2, c3, cr, words, max;
                if (this.dics && this.dics.has(this.START)) {
                    c1 = this.randKey(this.dics.get(this.START));
                    if (!this.dics.has(c1)) {
                        this.dics.set(c1, this.createDics());
                    }
                    c2 = this.randKey(this.dics.get(c1));
                    if (!this.dics.get(c1).has(c2)) {
                        this.dics.get(c1).set(c2, this.createDics());
                    }
                    cr = this.randKey(this.dics.get(c1).get(c2));
                    c3 = this.dics.get(c1).get(c2).get(cr);
                    words = [];
                    max = this.dics.length * 3;
                    this.loop(max, function(i) {
                        if (c3 === self.END) {
                            throw StopIteration;
                        }
                        if (i === 0) {
                            words.push(c1, c2, c3);
                        } else {
                            if (i > 5 && c3) {
                                // 重複ループを回避
                                self.loop(words.length, function(j) {
                                    if (words[j] === c3 &&
                                        words[j - 1] === words[words.length - 1] &&
                                        (c3.length >= 2 || words[j - 1].length >= 2)
                                    ) {
                                        words.splice(j - 1, 2);
                                    }
                                });
                            }
                            words.push(c3);
                        }
                        c1 = c2;
                        c2 = c3;
                        if (!self.dics.has(c1)) {
                            self.dics.set(c1, self.createDics());
                        }
                        if (!self.dics.get(c1).has(c2)) {
                            self.dics.get(c1).set(c2, self.createDics());
                        }
                        cr = self.randKey(self.dics.get(c1).get(c2));
                        c3 = self.dics.get(c1).get(c2).get(cr);
                    });
                    this.addTail(words);
                    result = this.joinWords(words);
                    
                    //if (!result && this.dics.length > 6) {
                    //    return this.chain2();
                    //}
                }
                return result;
            },
            /**
             * 言葉を学習 (要約用)
             *
             * @param  {String}  text  テキスト
             */
            learn: function(text) {
                let self = this, s, segs, len, c, c1, c2;
                s = this.removeSymbols(this.stringify(text));
                if (s) {
                    segs = this.morphemize(s);
                    this.addTail(segs);
                    segs.unshift(this.START);
                    segs.push(this.END);
                    len = segs.length;
                    if (len > 4) {
                        if (!this.dics) {
                            this.dics = this.createDics();
                        }
                        this.loop(len, function(j) {
                            let idx = j + 2;
                            c  = segs[idx];
                            c1 = segs[idx - 1];
                            c2 = segs[idx - 2];
                            if (!self.dics.has(c2)) {
                                self.dics.set(c2, self.createDics());
                            }
                            if (!self.dics.get(c2).has(c1)) {
                                self.dics.get(c2).set(c1, self.createDics());
                            }
                            self.dics.get(c2).get(c1).set(j, c);
                        });
                    }
                }
                return this;
            },
            addTail: function(array) {
                let first, last, re, dot;
                re = {
                    mb: /[\u0100-\uFFFF]/,
                    punct: /[,，.．､、｡。!！?？]$/
                };
                if (array && array.length > 2) {
                    first = array.shift();
                    do {
                        last = array.pop();
                    } while (array && array.length && !last);
                    if (!re.punct.test(last)) {
                        if (re.mb.test(first) || re.mb.test(last)) {
                            dot = '。';
                        } else {
                            dot = '.';
                        }
                    }
                    array.unshift(first);
                    array.push(last);
                    if (dot) {
                        array.push(dot);
                    }
                }
                return this;
            },
            isArray: function(o) {
                return Pot.isArray(o);
            },
            rand: function(min, max) {
                return Pot.rand(min, max);
            },
            randKey: function(hash) {
                let key, keys;
                if (hash && hash.isHash) {
                    keys = hash.keys();
                    if (keys) {
                        key = keys[this.rand(0, keys.length - 1)];
                    }
                }
                return key;
            },
            stringify: function(s) {
                return Pot.StringUtil.stringify(s);
            },
            trim: function(s) {
                return Pot.StringUtil.trim(s);
            },
            removeSymbols: function(s) {
                return this.stringify(
                    s && String(s).replace(this.SYMBOL_PATTERN, '') || ''
                );
            },
            joinWords: function(words) {
                let result = [], re, word, last;
                re = /[a-zA-Z0-9_ａ-ｚＡ-Ｚ０-９＿]/;
                if (words && this.isArray(words)) {
                    this.loop(words.length, function(i) {
                        word = words[i];
                        if (word) {
                            last = result[result.length - 1];
                            if (last) {
                                if (re.test(last) && re.test(word)) {
                                    word = ' ' + word;
                                }
                            }
                            result[result.length] = word;
                        }
                    });
                }
                return this.trim(result.join(''));
            },
            loop: function(length, callback) {
                let waiting = true;
                Pot.DeferredUtil.repeat(length, function(i) {
                    callback(i);
                }).addBoth(function(err) {
                    waiting = false;
                }).callback();
                till(function() {
                    return waiting !== true;
                });
            },
            /**
             * 簡易形態素解析
             * (あくまで簡易)
             *
             * @example morphemize('今日はいい天気です。');
             * @results ['今日', 'は', 'いい', '天気', 'です', '。']
             *
             * 名詞辞書を登録できる (正規表現も可)
             *
             * @example morphemize('まどかもなのはも魔法少女', ['なのは', /まどか(?:☆マギカ)?/]);
             * @results ['まどか', 'も', 'なのは', 'も', '魔法少女']
             *
             *
             * @param  {String}   text   対象の文字列
             * @param  {Array}   (dic)   (optionally)名詞としての辞書を使う場合
             * @return {Array}           解析した形態素配列
             */
            morphemize: (function() {
                let self, dics, enclose, s, p, patterns, re, bounds, point, matches,
                    clean, seq, unseq, parse, isRe, escRe, isArray, dic;
                point = 0;
                bounds = 1;
                seq = function(a) {
                    return Pot.StringUtil.escapeSequence(Pot.isNumber(a) ? Pot.StringUtil.chr(a) : a);
                };
                unseq = function(a) {
                    return Pot.isNumber(a) ? Pot.StringUtil.chr(a) : Pot.StringUtil.unescapeSequence(a);
                };
                enclose = function(a, b) {
                    return [
                        '(?:',
                        isArray(a) ? a.join(arguments.length >= 2 ? b : '|') : a,
                        ')'
                    ].join('');
                };
                isArray = function(a) {
                    return Pot.isArray(a);
                };
                isRe = function(a) {
                    return Pot.isRegExp(a);
                };
                escRe = function(a) {
                    return Pot.escapeRegExp(a);
                };
                parse = function(string) {
                    s = new String(self.stringify(string));
                    matches = [];
                    // 辞書を使う場合
                    if (isArray(dics) && dics && dics.length) {
                        self.loop(dics.length, function(n) {
                            dic = dics[n];
                            if (isRe(dic)) {
                                p = dic.toString().match(/^\/(.*?)\/(\w*)$/);
                                if (p && p[1]) {
                                    p = new RegExp(p[1], 'gi');
                                } else {
                                    p = dic;
                                }
                            } else {
                                p = new RegExp(escRe(self.stringify(dic)), 'gi');
                            }
                            try {
                                p.test('');
                                s = s.replace(p, function(m) {
                                    matches[matches.length] = m;
                                    return [
                                        bounds, bounds
                                    ].join(new Array(matches.length + 1).join(point));
                                });
                            } catch (e) {}
                        });
                    }
                    self.loop(patterns.length, function(n) {
                        p = new RegExp(patterns[n], 'gi');
                        s = s.replace(p, function(m) {
                            matches[matches.length] = m;
                            return [
                                bounds, bounds
                            ].join((new Array(matches.length + 1)).join(point));
                        });
                    });
                    s = s.replace(new RegExp(re.restore, 'g'), '').
                            replace(new RegExp(re.pointer, 'g'), function(a, m) {
                        return [
                            bounds, bounds
                        ].join(matches[m.length - 1]);
                    });
                    matches = [];
                    s = s.split(new RegExp(re.clean));
                    self.loop(s.length, function(n) {
                        if (s[n]) {
                            matches.push(s[n]);
                        }
                    });
                    return matches;
                };
                point  = unseq(point);
                bounds = unseq(bounds);
                re = {
                    kanji    : '[一-龠々〆ヵヶ]',
                    katakana : '[ァ-ヴｦ-ｯｱ-ﾝﾞ゛ﾟ゜・･\\u301Cー～－ｰ-]',
                    hiragana : '[ぁ-んﾞ゛ﾟ゜・･\\u301Cー～－ｰ-]',
                    word     : '[a-zA-Zａ-ｚＡ-Ｚ_＿0-9０-９]',
                    number   : '[0-9０-９]',
                    numbers  : enclose([
                                    '[-+－＋]{0,2}[0０\\\\￥BbXxＢｂＸｘ]{0,2}',
                                    enclose([
                                        '[0-9０-９a-fA-Fａ－ｆＡ－Ｆ]+[ULＵＬ]{0,2}',
                                        '[0-9０-９,，.．]+(?:[EeＥｅ][-+－＋]?[0-9０-９]+)?'
                                    ]),
                                    '[FDULＦＤＵＬ]{0,2}'
                                ], ''),
                    extra    : '[$#\'@:/=*+-]',
                    punct    : '[,，.．､、｡。!！?？]',
                    readable : '[^\\u0000-\\u0008\\s\\u3000]',
                    clean    : '[\\u0000-\\u0008]',
                    restore  : '[^' + seq(point) + seq(bounds) + ']+',
                    bounds   : '[' + seq(bounds) + ']',
                    point    : '[' + seq(point) + ']',
                    pointer  : '[' + seq(bounds) + ']' +
                                '([' + seq(point) + ']+)' +
                                '[' + seq(bounds) + ']',
                    adjectiverb: enclose([
                        'まっ[たてと]',
                        'し[いく][み]?',
                        'かく',
                        'んぼ',
                        'が[っらりるれろ]う?',
                        'さ[せれ]',
                        'わ[いぃうぅえぇおぉつっー]{0,4}',
                        [
                            '[っつ]{0,4}',
                            '[いうえかきくけこさしすせそたちつて',
                            'ぬねひふみむめりるれん',
                            'ぎぐげじずぜぞばびぶべ]'
                        ].join('')
                    ]),
                    polit: '[おご御]{0,1}',
                    particle: enclose([
                        'ところが[あぁー]*|なんだかんだ|およ[ばびぶべぼ]|[あと]りうる',
                        'だ?け[れん]?ど[ねも]*|か[あわ][いぃえぇつっー]*|ついて',
                        '[えおかきぐさざじすずそぞもやん][あぁいぃうぅえぇおぉー]*っと',
                        '[でま]す[うぅおぉよょー]*ん?|ませ[うぅおぉよょー]*ん?|あほ',
                        'くださ[いれ]|しゃ[らりるれろ]|ば[っッ]*か[しり]|かしら[んー]*',
                        'ござ(?:[いる]|[っッー]*[たて]|います?)|ゆっくり|はやく|ばか',
                        'がんば[らりるれろ]う?|[くぐ]らい|すべて|なご[らりるれろ]',
                        'おいて|[ぁ-ん][らりるれろ]|いっ[たて]|つ[まも]り|なんか|だから',
                        '[ぁ-ん]わい|むしろ|ような|な[あぁー]*んだ|なが?ら|ならば?',
                        'や(?:[あぁつっーぱ]*|は)り|ど[うぅおぉー]*して|まで|ぶり',
                        'だけど(?:[おぉよょうぅつぅー]*|も|)|ほとんど|ほぼ|その|かも',
                        'だ[けにのれ]|でき[たてる]?|され[たてぬるろ]?|だ[おぉよょー]*ん?',
                        '[あこふ]と|[かやゃ]ら|よ[うらりるれろ]|さ[えぇ]|[しと]か',
                        'な[いうかきくけこさしすせそらりるれろ]|[でと]も|[なほ]ど',
                        '[なよ]り|の[でに]|[いおとけさ][らりるれろ][うれ]?|[こも]の',
                        'な[あいくけさしすせそにのん][そば]?|も[おぉうぅー]|ほ[られ]',
                        'し(?:に?た[いか]|の[おぉうぅ]|[たてぬ])|[あたす][らりるれろ]う?',
                        'こそ|とは|ど[うの]|どこ(?:[つっうぅおぉよょー]|)|やり|ため',
                        '[あおかくこそまやゆよわだどぶ]れ|つ[いくつ]|され[たつて]つ?',
                        'だ[おぉねしよょつっわー]*|で[しす]|し[たつて]つ?|とき|[かわ]け',
                        '(?:ああ|いい|うう|ええ|おお|くく|けけ|' +
                            'ささ|そそ|ちち|ぬぬ|ねね|はは|ひひ|ふふ|' +
                            'へへ|ほほ|まま|むむ|めめ|やや|わわ|をを|んん)' +
                            '[あぁいぃうぅえぇおぉっッー]*',
                        'ぐぬぬ|[ほホ][あぁアァー]*|[わワ][ろロ][すスたタ]|[ぎギ]{2,}',
                        '[でデ][ゆユゅュ][ふフ][ふフ]|な[うにん]ぞ?|そ[うれ]|か[なも]',
                        'ものすごい|[だぽ][おぉねしよょつっわ]|いずれか?|もちろん|い?ます',
                        'あり(?:がと[っうぅおぉー]*|[んこっうぅおぉー]*|)|[あいし]?たい',
                        'こん(?:ど|[ばんはわやゃー]*|に?ち[やゃはわー]*|)|ちゃっ[たてと]',
                        'さ[いよ]う?なら[ー]*|ど[うぅ]?[いぃ]?たしまし[たて][えぇつっー]*',
                        'ど[うぅお]?も|お[つっ]*は[よょうぅおぉつっー]*|ちゃ[いうえお]',
                        'おや(?:すみ|[すみあぁうぅいぃつっー]*)(?:なさ[あぁいぃー]*|)',
                        'た[だら][いまー]*[あぁっー]*|おき(?:た|てる)|しばらく',
                        'よろ(?:しく|しゅう?)[おぉうぅゆゅっー]*|あ[そっ]こ|[あそ]んな',
                        '[こそど](?:こ|[っー]*ち)|わしゃ?|かれ|かのじょ|いもうと',
                        '[あわ](?:た[くー]?|)し[つっちー]*|あっし[つっちー]*',
                        'われ(?:われ|)[つっちー]*|[おわ]れ[つっちー]*|まし[たて]',
                        'おい(?:ら|どん)[つっちー]*|ぼく(?:ちん|)[つっちー]*',
                        'ね[むも]い|ね[みむも][いぃつっよょおぉー]*|だらだら|だ[がしねよ]',
                        'け?だ[るり]い|け?だ[るり][いぃつっよょおぉー]*',
                        'う[ざぜ]い|う[ざぜ][えぇいぃつっよょおぉー]*|すん?ばらし[いくー]?',
                        'かなし[いぃつっいぃよょおぉー]*|ぱいぱい|ぱんつ',
                        'うれし[いぃつっいぃよょおぉー]*|っ?ぽい|しまぱん',
                        'むなし[いぃつっいぃよょおぉー]*|かちかち|くんくん',
                        'おっ?ぱ[あぁつっー]*い|いろいろ|そろそろ|こういう',
                        '(?:[いぃ]ろ[いぃろおぉつっんなあぁー])+|たっぷり|だ[なよわ]',
                        'なんだ[あぁいぃおぉかつってなー]*|に[およ]い(?![たて])',
                        '(?:[くク][んン][かカ])+|[さサたタﾀ][そソｿンん]',
                        '(?:[ちチ][ゅュ][っッうぅウゥー]*)+|は[あぁつっー]*は[あぁつっー]*',
                        'もふ[つっうぅーん]*もふ[つっうぅーん]*|あげる?|とりあえず',
                        'はてな|すもも|ふぁぼ|ねこ[ぢじ]る|いぬ|ねこ|ろり(?:こん|)',
                        'ぬるぽ(?![ぁ-ん])|がっ(?![ぁ-ん])|し[なにぬねの]な?|おしっこ',
                        '[しち]{0,2}[あいうえお-ぢつ-もやゆよ-ろわ-ん]' +
                            '[ぁぃぅぇぉっゃゅょゎー]+[あいうえお-ぢつ-もやゆよ-ろわ-ん]',
                        'おも(?:う|[つっうぅおぉー]*[たて]|)'
                    ]),
                    conjunct: '[かがさぞただてでとなにねのはへもやよわを]',
                    graph: [
                        '[!-~°-×Α-ё‐-⇔∀-⌒①-⑳',
                        '─-╋■-♯、-〟゛-ゞ・-ヾ㌃-㍗！-￥]'
                    ].join('')
                };
                patterns = [
                    enclose([
                        enclose(re.kanji + '{2,4}(?!' + re.adjectiverb + ')')
                    ]),
                    enclose([
                        enclose(re.polit + re.kanji + '{1,2}?' +
                                '(?!' + re.particle + ')' + re.adjectiverb
                        )
                    ]),
                    enclose([
                        enclose(re.particle)
                    ]),
                    enclose([
                        enclose(re.conjunct),
                        enclose(re.polit + re.hiragana + '{1,2}' + re.adjectiverb)
                    ]),
                    enclose([
                        enclose(re.numbers + '{1,32}'),
                        enclose(re.punct   + '{1,4}'),
                        enclose(re.polit + re.katakana + '{1,24}'),
                        enclose(re.polit + re.kanji    + '{1,4}'),
                        enclose(re.polit + re.hiragana + '{1,8}'),
                        enclose(re.word  + enclose([re.word, re.extra]) + '{1,12}'),
                        enclose(re.word    + '{1,24}'),
                        enclose(re.graph   + '{1,12}'),
                        enclose(re.readable)
                    ])
                ];
                // 使うものだけ残してクリア
                re = {
                    clean: re.clean,
                    restore: re.restore,
                    pointer: re.pointer
                };
                enclose = null;
                return function(text, dic) {
                    self = this;
                    dics = dic;
                    return parse(text);
                };
            })()
        };
        MarkovChainer.prototype.init.prototype = MarkovChainer.prototype;
        return MarkovChainer;
    })()
});


})();
//-----------------------------------------------------------------------------
// Pot.BookmarkUtil - Bookmark utilities
//-----------------------------------------------------------------------------
(function() {


Pot.BookmarkUtil = {};
Pot.extend(Pot.BookmarkUtil, {
    checkPattern: /(?:photo|quote|link|conversation|video|bookmark)/,
    check: function(ps) {
        var result = true, uri = ps.itemUrl;
        if (Pot.BookmarkUtil.isDisableURI(uri)) {
            result = false;
        } else {
            result = Pot.BookmarkUtil.checkPattern.test(ps.type) && !ps.file;
        }
        return result;
    },
    /*
     * ブックマークするURLの拡張子が画像の場合 TumblrにPOSTしてるとみなし
     * 無意味なブックマークを避ける
     *
     * 「abc123.jpg」のようなページタイトルは画像とみなしURLをドメインに変換
     * それ以外は一つ上のディレクトリのURLに変換する
     *
     * (場合によっては余計な機能かもしれないので調節中)
     *
     * GoogleBookmarksなど一部のサービスによっては
     * ブクマ数が大量になると不安定になるのでその考慮のためのメソッド
     */
    fixURI: function(ps) {
        var ok = true;
        if (Pot.BookmarkUtil.isImageURI(ps.itemUrl)) {
            if (Pot.BookmarkUtil.isImageTitle(ps.item)) {
                ps.itemUrl = Pot.BookmarkUtil.toDomainURI(ps.itemUrl);
            } else {
                ps.itemUrl = Pot.BookmarkUtil.toParentURI(ps.itemUrl);
            }
            ok = false;
        }
        return ok ? succeed(ps) : request(ps.itemUrl).addCallback(function(res) {
            var title, doc = convertToHTMLDocument(res.responseText);
            title = doc && doc.title || '';
            if (title && title.length >= 3 &&
                (/\b(?:404|Not\s*Found|Error|Fail[a-z]*)\b/i.test(title) && /^[\u0000-\u0080]+$/.test(title))) {
                title = ps.item;
            } else {
                title += (title.slice(-1) === ' ' ? '' : ' ') + '[' + ps.item + ']';
            }
            ps.item = title;
            return ps;
        });
    },
    toParentURI: function(url) {
        var uri = String(url || '').split('/');
        uri.pop();
        return uri.join('/');
    },
    toDomainURI: function(url) {
        var result, uri = Pot.StringUtil.stringify(url);
        try {
            result = uri.match(/^(\w+:\/*[^\/]+\/?)/)[1];
        } catch (e) {
            result = uri;
        }
        return result;
    },
    isImageTitle: function(title) {
        return /^\s*[\/=+!?#%~()|{}\[\]@*`<>&'"^$:;,.\w-]+?\.(?:jpe?g|png|gif|svg|bmp|ico|tif)\s*$/i.test(title);
    },
    isImageURI: function(url) {
        var result, uri = Pot.StringUtil.stringify(url), ext = uri.split('.').pop();
        switch (ext.toLowerCase()) {
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif':
            case 'bmp':
            case 'ico':
            case 'tif':
            case 'svg':
                result = true;
                break;
            default:
                result = false;
                break;
        }
        return result;
    },
    isDisableURI: function(url) {
        var result = false, disables = {
            // TumblrはReBlogにチェックしてた場合ものすごい数になるのでブックマークしない
            tumblr: function(url) {
                var disable = true, pattern, sub, dir, matches;
                pattern = /^https?:\/\/([\w-]*[.])*?tumblr[.]com\/(.+)/i;
                try {
                    if (!pattern.test(url)) {
                        disable = false;
                    } else {
                        matches = url.match(pattern);
                        sub = matches[1];
                        dir = matches[2];
                        if (/^(?:www|staff)[.]$/.test(sub)) {
                            disable = false;
                            dir = dir.replace(/^[^a-z]+|[^a-z]+$|[!#?].*$/g, '');
                            // ダッシュボード以外は許可する
                            if (!dir || /^(?:dashboard|photo|text|quote|link|chat|audio|video)/.test(dir)) {
                                disable = true;
                            }
                        }
                    }
                } catch (e) {
                    disable = true;
                }
                return disable;
            },
            // ローカル/IPは誤ってPOSTボタン押したと判断する
            local: /^https?:\/\/(?:192\.168\.\d{1,2}\.\d{1,2}|127\.0\.0\.\d|localhost)\/.+/i,
            file: /^file:\/+\S+/i
        };
        forEach(disables, function([name, check]) {
            if (!result) {
                if (Pot.isRegExp(check) && check.test(url)) {
                    result = true;
                } else if (Pot.isFunction(check) && check(url)) {
                    result = true;
                }
            }
        });
        return result;
    },
    /**
     * イテレータとして機能しないオブジェクトを修正する
     *
     * 例. はてブから返ったタグ一覧をもつJSONが
     *     "__iterator__" というタグ名を持ってた場合、for-in で TypeError が発生する。
     *
     * Hashオブジェクト/ライブラリを作りそれを使うよう書き換えれば解決するけど、
     * 大掛かりなので現状はしない。(暫定Hashは作った)
     *
     * 一時的な対策として __iterator__ を持っている場合プロパティ名を置換し、処理後に元に戻す
     * ということを処理するオブジェクト。
     *
     * ※それでもエラーが起きる時があるのでいっそ置換してしまおうか検討中
     *
     * @example
     *    var f = new fixTags();
     *    tags = f.replace(tags);
     *    // ...処理...
     *    tags = f.restore(tags);
     *
     *
     * @return {Object} fixTags
     */
    fixTags: (function() {
        const specials = {
            importants: <>
                __iterator__
            </>.toString().trim().split(/\s+/),
            subs: <>
                __parent__ __proto__  __defineGetter__ __defineSetter__
                __count__ __lookupGetter__ __lookupSetter__ __noSuchMethod__
                create defineProperty defineProperties getOwnPropertyDescriptor keys
                getOwnPropertyNames getPrototypeOf preventExtensions isExtensible seal
                isSealed freeze isFrozen apply call constructor eval
                hasOwnProperty isPrototypeOf propertyIsEnumerable toSource
                toLocaleString toString unwatch valueOf watch
            </>.toString().trim().split(/\s+/)
        };
        var hasOwnProperty, hasOwnProp, hasProp, hasIteratorProp, FixTags;
        
        hasOwnProperty = Object.prototype.hasOwnProperty;
        hasOwnProp = function(object, prop) {
            return hasOwnProperty.call(object, prop);
        };
        hasProp = function(object, prop) {
            var has = false, name;
            for (name in object) {
                if (name == prop) {
                    has = true;
                    break;
                }
            }
            return has;
        };
        hasIteratorProp = function(object) {
            var has = false, k, msg;
            try {
                if (Pot.isObject(object)) {
                    for (k in object) {
                        break;
                    }
                    has = false;
                }
            } catch (e) {
                msg = String(e);
                specials.importants.forEach(function(s) {
                    if (msg.indexOf(s) !== -1) {
                        has = true;
                    }
                });
            }
            return has;
        };
        FixTags = function() {
            return new arguments.callee.prototype.init();
        };
        FixTags.prototype = update(FixTags.prototype, {
            orgTags: [],
            init: function() {
                this.orgTags = [];
                return this;
            },
            replace: function(tags) {
                return this.replaceSubs(this.replaceImportants(tags));
            },
            replaceImportants: function(tags) {
                var result;
                if (hasIteratorProp(tags)) {
                    result = this.replaceAll(tags, specials.importants, hasOwnProp);
                } else {
                    result = tags;
                }
                return result;
            },
            replaceSubs: function(tags) {
                return this.replaceAll(tags, specials.subs, hasProp);
            },
            replaceAll: function(tags, specials, hasOwn) {
                var self = this, special, uniq, exists;
                if (specials && tags && Pot.isObject(tags)) {
                    exists = false;
                    specials.forEach(function(special) {
                        if (hasOwn(tags, special)) {
                            exists = true;
                            uniq = 'pot';
                            do {
                                uniq += String.fromCharCode(Pot.rand(0x61, 0x7A));
                            } while (hasOwn(tags, uniq));
                            tags[uniq] = tags[special];
                            self.orgTags.push({
                                org: special,
                                tmp: uniq
                            });
                            delete tags[special];
                        }
                    });
                }
                return tags;
            },
            // はてブ用
            restoreHatena: function(tags) {
                var self = this, result;
                result = tags.map(function(item) {
                    item.name = self.restoreName(item.name);
                    return item;
                });
                return result;
            },
            restore: function(object) {
                var i, len, tag;
                if (Pot.isObject(object)) {
                    len = this.orgTags.length;
                    for (i = 0; i < len; i++) {
                        tag = this.orgTags[i];
                        if (tag && tag.tmp && tag.org && hasProp(object, tag.tmp)) {
                            object[tag.org] = object[tag.tmp];
                            try {
                                delete object[tag.tmp];
                            } catch (e) {}
                        }
                    }
                }
                return object;
            },
            restoreName: function(name) {
                var result = name, i, len, tag;
                len = this.orgTags.length;
                for (i = 0; i < len; i++) {
                    tag = this.orgTags[i];
                    if (tag && tag.tmp && tag.org && tag.tmp === name) {
                        result = tag.org;
                        break;
                    }
                }
                return result;
            },
            clear: function() {
                this.orgTags = [];
                return this;
            }
        });
        FixTags.prototype.init.prototype = FixTags.prototype;
        return function() {
            return FixTags.apply(FixTags, arguments);
        };
    })(),
    /**
     * タグ/ラベルを正規化
     */
    normalizeTags: function(tags) {
        var result = [], skip, prop, i, item, explode = function(tag) {
            var r = [];
            Pot.StringUtil.stringify(tag).split(/[,\s\u3000]+/).forEach(function(t) {
                if (t && t.length) {
                    r.push(t);
                }
            });
            return r;
        };
        skip = false;
        if (typeof tags === 'string' || Pot.isNumber(tags)) {
            tags = explode(String(tags));
        } else if (tags) {
            tags = Pot.isArray(tags) ? tags : [];
            // Object なら処理しない [called from *.getSuggestions()]
            for (i in tags) {
                item = tags[i];
                break;
            }
            if (Pot.isObject(item) && !Pot.isArray(item)) {
                for (prop in item) {
                    break;
                }
                if (prop && prop.length && !Pot.isNumeric(prop)) {
                    skip = true;
                }
            }
        } else {
            tags = [];
        }
        if (skip) {
            result = tags;
        } else {
            (Pot.isArray(tags) ? tags : []).forEach(function(tag) {
                explode(tag).forEach(function(t) {
                    if (t && t.length) {
                        result.push(t);
                    }
                });
            });
            result = Pot.ArrayUtil.unique(result);
        }
        return result;
    },
    // 自動で付加するタグを付ける
    appendConstantTags: function(tags) {
        var result = [], appendTags;
        if (tags && Pot.isArray(tags)) {
            result = Pot.ArrayUtil.toArray(tags);
            appendTags = Pot.StringUtil.trim(Pot.getPref(POT_AUTO_APPEND_TAGS));
            if (appendTags) {
                appendTags.split(/[,\s\u00A0\u3000]+/).reverse().forEach(function(tag) {
                    tag = Pot.StringUtil.trim(tag).replace(/,/g, '');
                    if (tag && tag.length) {
                        result.unshift(tag);
                    }
                });
            }
        }
        return Pot.BookmarkUtil.normalizeTags(result);
    },
    // 指定文字数で丸める
    truncateFields: function(service, field, value) {
        var result = '', max, unit, len, cnt, cutText, isTag = false;
        if (!(service in MAX_LENGTH) || !(field in MAX_LENGTH[service])) {
            result = value;
        } else {
            cutText = function(s) {
                var ret, sizes, chars, size, text = Pot.StringUtil.stringify(s);
                switch (unit) {
                    case 'byte':
                        chars = text.split('');
                        sizes = chars.map(function(c) {
                            return c.charCodeAt(0) > 0xff ? 3 : 1;
                        });
                        size = sizes.reduce(function(a, b) {
                            return a + b;
                        });
                        while (chars.length && size > max) {
                            chars.pop();
                            size -= sizes.pop();
                        }
                        ret = chars.join('');
                        break;
                    case 'uni':
                    default:
                        ret = text.slice(0, max);
                        break;
                }
                return ret;
            };
            if (/^tag/i.test(field)) {
                isTag = true;
                result = [];
                cnt = MAX_LENGTH[service].tagCount;
            }
            unit = MAX_LENGTH[service].unit;
            len = MAX_LENGTH[service][field];
            if (len === null) {
                result = value;
            } else if (Pot.isNumeric(len)) {
                max = Math.max(0, len);
                if (max > 0) {
                    if (isTag) {
                        result = [];
                        ((value && Pot.isArray(value)) ? value : []).forEach(function(val) {
                            val = cutText(val);
                            if (val && val.length && result.length < cnt) {
                                result.push(val);
                            }
                        });
                        result = Pot.BookmarkUtil.normalizeTags(result);
                    } else {
                        result = cutText(value);
                    }
                }
            }
        }
        return result;
    }
});


})();
//-----------------------------------------------------------------------------
// Definition - Bookmark/Audio models
//-----------------------------------------------------------------------------
(function() {

var patterns = {
    rpqlcvab: /(?:regular|photo|quote|link|conversation|video|audio|bookmark)/,
    rpqlcvb: /(?:regular|photo|quote|link|conversation|video|bookmark)/,
    rpqlb: /(?:regular|photo|quote|link|bookmark)/,
    rqlcvb: /(?:regular|quote|link|conversation|video|bookmark)/,
    pqlcvb: /(?:photo|quote|link|conversation|video|bookmark)/
};

//
// 主なソーシャルブックマークサービスの check メソッドをオーバーライド
// (他にもあるかもしれないけど使ったことなくて知らない..)
//
forEach({
    Tumblr: function(ps) {
        return patterns.rpqlcvab.test(ps.type);
    },
    Local: function(ps) {
        return patterns.rpqlb.test(ps.type) || ps.type === 'audio';
    },
    GoogleBookmarks: function(ps) {
        return patterns.pqlcvb.test(ps.type) && !ps.file;
    },
    Evernote: function(ps) {
        return patterns.rqlcvb.test(ps.type) && !ps.file;
    },
    Delicious: function(ps) {
        return patterns.pqlcvb.test(ps.type) && !ps.file;
    },
    FirefoxBookmark: function(ps) {
        return patterns.pqlcvb.test(ps.type) && !ps.file;
    },
    YahooBookmarks: function(ps) {
        return patterns.pqlcvb.test(ps.type) && !ps.file;
    },
    HatenaBookmark: function(ps) {
        return patterns.pqlcvb.test(ps.type) && !ps.file;
    },
    LivedoorClip: function(ps) {
        return patterns.pqlcvb.test(ps.type) && !ps.file;
    }
}, function([name, check]) {
    update(models[name], {check: check});
});


})();
//-----------------------------------------------------------------------------
// Update - Google Bookmark
//-----------------------------------------------------------------------------
(function() {


update(models.GoogleBookmarks, {
    name: 'GoogleBookmarks',
    ICON: models.Google.ICON,
    check: function(ps) {
        return Pot.BookmarkUtil.check(ps);
    },
    privateCache: {
        bookmarked: {
            data: {},
            has: function(url) {
                return typeof GoogleBookmarks.privateCache.bookmarked.data[url] !== 'undefined';
            },
            add: function(url) {
                GoogleBookmarks.privateCache.bookmarked.data[url] = true;
            },
            clear: function() {
                GoogleBookmarks.privateCache.bookmarked.data = {};
            }
        },
        tags: {
            normalize: function(tags) {
                var result = [];
                //
                // 増えたタグの解析を行うようにする
                //
                //FIXME: #503 API制限をキャッシュでどうにかする
                //
                Pot.QuickPostForm.resetCandidates();
                if (Pot.isArray(tags)) {
                    result = tags || [];
                }
                return Pot.BookmarkUtil.normalizeTags(result);
            }
        }
    },
    isBookmarked: function(url) {
        var self = this, findUrl = 'https://www.google.com/bookmarks/find';
        return self.privateCache.bookmarked.has(url) ? succeed(true) : request(findUrl, {
            queryString: {
                start: 0,
                num: 1,
                output: 'xml',
                q: url
            }
        }).addCallback(function(res) {
            var uris, result, xpath, doc = convertToHTMLDocument(res.responseText);
            if (doc.getElementById('gaia_loginform')) {
                throw new Error(getMessage('error.notLoggedin'));
            }
            xpath = '//bookmark//title[normalize-space()][string-length()>0]/../url/text()';
            uris = $x(xpath, doc, true);
            result = false;
            ((Pot.isArray(uris) && uris) || (uris && [String(uris)]) || []).forEach(function(uri) {
                if (uri == url) {
                    self.privateCache.bookmarked.add(url);
                    result = true;
                }
            });
            return result;
        });
    },
    getBookmarkTagsByURI: function(uri) {
        var url = 'https://www.google.com/bookmarks/find';
        return request(url, {
            queryString: {
                start: 0,
                num: 1,
                output: 'xml',
                q: uri
            }
        }).addCallback(function(res) {
            var labels, xp, result, doc = convertToHTMLDocument(res.responseText);
            xp = '//bookmark//url[text()=' + Pot.escapeXPathText(uri) + ']/../labels//label//text()';
            labels = $x(xp, doc, true);
            if (labels && Pot.isArray(labels)) {
                result = labels.map(function(label) {
                    return Pot.StringUtil.trim(label);
                });
            } else {
                result = labels ? [Pot.StringUtil.trim(labels)] : [];
            }
            return Pot.BookmarkUtil.normalizeTags(result);
        });
    },
    getBookmarkDescriptionByURI: function(uri) {
        var url = 'https://www.google.com/bookmarks/find', fixRSS = {
            //
            // --------------------------------------------------------------
            //XXX: convertToHTMLDocument で変換すると、
            //     まれに <a>hoge</a><b>fuga</b> のようなXMLが
            //            <a>hoge<b>fuga</b>     のように変換されてしまう。
            //     こうなるとXPATH, DOM操作ができなくなる
            // --------------------------------------------------------------
            // * fixRSSはノード名を置換して回避してるが根本的な解決じゃない
            // * RSSの時だけ発生(?)
            // --------------------------------------------------------------
            //
            name: 'potuniqid' + (new Date).getTime(),
            execute: function(rss) {
                return String(rss).replace(/<(\/|)link\b([^>]*)>/ig, '<$1' + fixRSS.name + '$2>');
            }
        };
        return request(url, {
            queryString: {
                start: 0,
                num: 1,
                output: 'rss',
                q: uri
            }
        }).addCallback(function(res) {
            var desc = null, items, doc, text;
            text = fixRSS.execute(res.responseText);
            doc = convertToHTMLDocument(text);
            items = Pot.ArrayUtil.toArray(doc.getElementsByTagName('item') || []);
            (Pot.isArray(items) ? items : []).forEach(function(item) {
                try {
                    if (desc === null && item.getElementsByTagName(fixRSS.name)[0].innerHTML === uri) {
                        desc = item.getElementsByTagName('smh:bkmk_annotation')[0].innerHTML;
                    }
                } catch (e) {}
            });
            return desc ? Pot.StringUtil.trim(desc) : '';
        });
    },
    getAnnotation: function(ps) {
        var annotation = joinText([ps.body, ps.description], ' ', true);
        if (!annotation) {
            annotation = [ps.item, ps.itemUrl].join(' ');
        }
        return Pot.BookmarkUtil.truncateFields(this.name, 'comment', annotation);
    },
    post: function(ps) {
        var self = this;
        return this.isBookmarked(ps).addCallback(function(bookmarked) {
            if (bookmarked) {
                // ブックマークが存在する場合は上書き (Update) される
                //throw new Error('Already bookmarked: ' + ps.itemUrl);
            }
            return Pot.BookmarkUtil.fixURI(ps).addCallback(function(newps) {
                ps = newps;
                request('https://www.google.com/bookmarks/mark', {
                    queryString: {
                        op: 'add'
                    }
                }).addCallback(function(res) {
                    var url, action, tags, fs, doc = convertToHTMLDocument(res.responseText);
                    if (doc.getElementById('gaia_loginform')) {
                        throw new Error(getMessage('error.notLoggedin'));
                    }
                    fs = formContents(doc);
                    tags = Pot.BookmarkUtil.appendConstantTags(
                            (ps.tags && Pot.isArray(ps.tags)) ? ps.tags : []
                    );
                    tags = Pot.BookmarkUtil.truncateFields(self.name, 'tagLength', tags);
                    action = $x('//form[@name="add_bkmk_form"]/@action', doc);
                    if (action) {
                        url = 'https://www.google.com' + action;
                    } else {
                        url = 'https://www.google.com/bookmarks/mark';
                    }
                    return request(url, {
                        redirectionLimit: 0,
                        sendContent: {
                            title: Pot.BookmarkUtil.truncateFields(self.name, 'title', ps.item),
                            bkmk: ps.itemUrl,
                            annotation: self.getAnnotation(ps),
                            labels: joinText(tags, ','),
                            btnA: fs.btnA,
                            sig: fs.sig,
                            // 'zx' 必要かもしれないユニーク乱数パラメータ
                            zx: Math.random().toString(36).split('.').pop()
                        }
                    }).addCallback(function(response) {
                        // オートコンプリートで使うタグをリセット
                        Pot.QuickPostForm.resetCandidates();
                    });
                });
            });
        });
    },
    getSuggestions: function(url) {
        var self = this, dup;
        return self.isBookmarked(url).addCallback(function(bookmarked) {
            dup = bookmarked;
            return request('http://www.google.com/bookmarks').addCallback(function(res) {
                var tags, doc = convertToHTMLDocument(res.responseText);
                tags = $x('descendant::a[starts-with(normalize-space(@id),"lbl_m_")' +
                          ' and number(substring(normalize-space(@id),7))>0]/text()', doc, true).map(function(tag) {
                    return {
                        name: tag,
                        frequency: -1
                    };
                });
                tags = self.privateCache.tags.normalize(tags);
                return {
                    duplicated: dup,
                    recommended: [],
                    tags: tags
                };
            });
        });
    }
});


})();
//-----------------------------------------------------------------------------
// Update - Hatena Bookmark
//-----------------------------------------------------------------------------
(function() {


update(models.HatenaBookmark, {
    name: 'HatenaBookmark',
    ICON: 'http://b.hatena.ne.jp/favicon.ico',
    POST_URL: 'http://b.hatena.ne.jp/add',
    check: function(ps) {
        return Pot.BookmarkUtil.check(ps);
    },
    post: function(ps) {
        Pot.QuickPostForm.resetCandidates();
        // タイトルは共有されているため送信しない
        return this.addBookmark(
            ps.itemUrl,
            null,
            Pot.BookmarkUtil.truncateFields(this.name, 'tagLength', this.validateTags(Pot.BookmarkUtil.appendConstantTags(ps.tags))),
            Pot.BookmarkUtil.truncateFields(this.name, 'comment', joinText([ps.body, ps.description], ' ', true))
        );
    },
    privateCache: {
        bookmarked: {
            data: {},
            has: function(url) {
                return typeof HatenaBookmark.privateCache.bookmarked.data[url] !== 'undefined';
            },
            add: function(url) {
                HatenaBookmark.privateCache.bookmarked.data[url] = true;
            },
            clear: function() {
                HatenaBookmark.privateCache.bookmarked.data = {};
            }
        },
        tags: {
            normalize: function(tags) {
                var result = [];
                //
                // 増えたタグの解析を行うようにする
                //
                //FIXME: #503 API制限をキャッシュでどうにかする
                //
                Pot.QuickPostForm.resetCandidates();
                if (Pot.isArray(tags)) {
                    result = tags || [];
                }
                return Pot.ArrayUtil.unique(result);
            }
        }
    },
    /**
     * はてなブックマークのタグで使用できない文字を置換する
     */
    validateTags: function(tags) {
        // 仕方なく全角にする
        var result = [], marks = {
            '?': '？',
            '/': '／',
            '%': '％',
            '[': '［',
            ']': '］',
            ':': '：'
        }, re = {
            by: new RegExp('[' + keys(marks).map(function(k) {
                    return Pot.escapeRegExp(k);
                }) + ']', 'g'),
            to: function(m) {
                return marks[m] || '';
            }
        };
        Pot.BookmarkUtil.normalizeTags(tags).forEach(function(tag) {
            tag = tag.replace(re.by, re.to);
            if (tag && tag.length) {
                result.push(tag);
            }
        });
        return result;
    },
    isBookmarked: function(url) {
        var self = this;
        return self.privateCache.bookmarked.has(url) ? succeed(true) : 
               self.getEntry(url).addCallback(function(data) {
                    var result = false;
                    try {
                        if ((data.url && data.url === url) ||
                            (data.original_url && data.original_url === url)) {
                            if (data.bookmarked_data &&
                                data.bookmarked_data.timestamp &&
                                data.bookmarked_data.user != null) {
                                self.privateCache.bookmarked.add(url);
                                result = true;
                            }
                        }
                    } catch (e) {
                        result = false;
                    }
                    return result;
               });
    },
    getEntry: function(url) {
        var self = this;
        return request('http://b.hatena.ne.jp/my.entry', {
            queryString : {
                url: url
            }
        }).addCallback(function(res) {
            return JSON.parse(res.responseText);
        });
    },
    getUserTags: function(user) {
        return request('http://b.hatena.ne.jp/' + user + '/tags.json').addCallback(function(res) {
            var fixTags, tags = JSON.parse(res.responseText)['tags'];
            // ----------------------------------------------------------------
            //FIXME: __iterator__ というタグ名を付けると常に TypeError
            //       タグ名に限らずObjectをHashとして使ってるコード全て懸念.
            // ----------------------------------------------------------------
            
            // ※応急的な処置
            // とりあえずイテレータ等のタグ名を置換する
            fixTags = new Pot.BookmarkUtil.fixTags();
            tags = fixTags.replace(tags);
            
            // 本来の処理
            tags = items(tags).map(function(pair) {
                return {
                    name: pair[0],
                    frequency: pair[1].count
                }
            });
            
            // 置換したタグ名を元に戻す
            tags = fixTags.restoreHatena(tags);
            
            fixTags.clear();
            fixTags = null;
            
            return tags;
        });
    },
    addBookmark: function(url, title, tags, description) {
        return Hatena.getToken().addCallback(function(token) {
            return request('http://b.hatena.ne.jp/bookmarklet.edit', {
                redirectionLimit: 0,
                sendContent: {
                    rks: token,
                    url: url.replace(/%[0-9a-f]{2}/g, function(s) {
                        return s.toUpperCase();
                    }),
                    title: title,
                    comment: Hatena.reprTags(tags) + description.replace(/[\n\r]+/g, ' ')
                }
            });
        });
    },
    /**
     * タグ、おすすめタグ、キーワードを取得する
     * ページURLが空の場合、タグだけが返される。
     *
     * @param  {String}  url  関連情報を取得する対象のページURL。
     * @return {Object}
     */
    getSuggestions: function(url) {
        var self = this;
        return Hatena.getCurrentUser().addCallback(function(user) {
            return new DeferredHash({
                tags: self.getUserTags(user),
                entry: self.getEntry(url)
            });
        }).addCallback(function(ress) {
            var entry, tags, duplicated, endpoint, form;
            entry = ress.entry[1];
            tags = ress.tags[1] || [];
            tags = self.privateCache.tags.normalize(tags);
            duplicated = !!entry.bookmarked_data;
            endpoint = HatenaBookmark.POST_URL + '?' + queryString({
                mode: 'confirm',
                url: url
            });
            form = {
                item: entry.title
            };
            if (duplicated) {
                form = update(form, {
                    description: entry.bookmarked_data.comment,
                    tags: entry.bookmarked_data.tags,
                    private: entry.bookmarked_data.private
                });
            }
            return {
                form: form,
                editPage: endpoint,
                tags: tags,
                duplicated: duplicated,
                recommended: entry.recommend_tags
            }
        });
    }
});


})();
//-----------------------------------------------------------------------------
// Update - Delicious
//-----------------------------------------------------------------------------
(function() {


update(models.Delicious, {
    name: 'Delicious',
    ICON: 'http://www.delicious.com/favicon.ico',
    check: function(ps) {
        return Pot.BookmarkUtil.check(ps);
    },
    /**
     * ユーザーの利用しているタグ一覧を取得する。
     *
     * @param  {String} user 対象ユーザー名。未指定の場合、ログインしているユーザー名が使われる。
     * @return {Array}
     */
    getUserTags: function(user) {
        // 同期でエラーが起きないようにする
        return succeed().addCallback(function() {
            return request('http://feeds.delicious.com/feeds/json/tags/' + (user || Delicious.getCurrentUser()));
        }).addCallback(function(res) {
            var tags = evalInSandbox(res.responseText, 'http://feeds.delicious.com/');
            
            // タグが無いか?(取得失敗時も発生)
            if (!tags || isEmpty(tags)) {
                tags = [];
            } else {
                tags = reduce(function(memo, tag) {
                    memo.push({
                        name: tag[0],
                        frequency: tag[1]
                    });
                    return memo;
                }, tags, []);
            }
            return tags;
        });
    },
    /**
     * タグ、おすすめタグ、ネットワークなどを取得する。
     * ブックマーク済みでも取得することができる。
     *
     * @param  {String} url 関連情報を取得する対象のページURL。
     * @return {Object}
     */
    getSuggestions: function(url) {
        var self = this, ds = {
            tags: this.getUserTags(),
            suggestions: succeed().addCallback(function() {
                // ログインをチェックする
                self.getCurrentUser();
                
                // ブックマークレット用画面の削除リンクを使い既ブックマークを判定する
                return request('http://www.delicious.com/save', {
                    queryString: {
                        noui: 1,
                        url: url
                    }
                });
            }).addCallback(function(res) {
                var doc = convertToHTMLDocument(res.responseText);
                return {
                    editPage: 'http://www.delicious.com/save?url=' + encodeURIComponent(url),
                    form: {
                        item: doc.getElementById('saveTitle').value,
                        description: doc.getElementById('saveNotes').value,
                        tags: doc.getElementById('saveTags').value.split(/[\s\u3000]+/),
                        private: doc.getElementById('savePrivate').checked
                    },
                    duplicated: !!doc.getElementById('savedon'),
                    recommended: $x('id("recommendedField")//span[contains(@class,"m")]/text()', doc, true)
                }
            })
        };
        return new DeferredHash(ds).addCallback(function(ress) {
            // エラーチェック
            for each (var [success, res] in ress) {
                if (!success) {
                    throw res;
                }
            }
            var result = ress.suggestions[1];
            result.tags = ress.tags[1];
            return result;
        });
    },
    // FIXME: 判定不完全、_userが取得できて、かつ、ログアウトしている状態がありうる
    getCurrentUser: function() {
        var user;
        try {
            user = decodeURIComponent(getCookieString('www.delicious.com', '_user')).match(/user=(.*?)\s+/)[1];
        } catch (e) {
            user = null;
            throw e;
        }
        if (!user) {
            throw new Error(getMessage('error.notLoggedin'));
        }
        return user;
    },
    post: function(ps) {
        var tags, notes, title;
        title = Pot.BookmarkUtil.truncateFields(this.name, 'title', ps.item);
        tags = Pot.BookmarkUtil.truncateFields(this.name, 'tagLength', Pot.BookmarkUtil.appendConstantTags(ps.tags));
        notes = Pot.BookmarkUtil.truncateFields(this.name, 'comment', joinText([ps.body, ps.description], ' ', true));
        return request('http://www.delicious.com/post/', {
            queryString: {
                title: title,
                url: ps.itemUrl
            }
        }).addCallback(function(res) {
            var elmForm, doc = convertToHTMLDocument(res.responseText);
            elmForm = doc.getElementById('saveForm');
            if (!elmForm) {
                throw new Error(getMessage('error.notLoggedin'));
            }
            return request('http://www.delicious.com' + $x('id("saveForm")/@action', doc), {
                redirectionLimit: 0,
                sendContent: update(formContents(elmForm), {
                    description: title,
                    jump: 'no',
                    notes: notes,
                    tags: joinText(tags, ' '),
                    share: (ps.private || Pot.getPref(POT_BOOKMARK_PRIVATE)) ? 'no' : ''
                })
            });
        });
    }
});


})();
//-----------------------------------------------------------------------------
// Update - Yahoo! API
// http://developer.yahoo.co.jp/jlp/MAService/V1/parse.html
// http://developer.yahoo.co.jp/webapi/jlp/keyphrase/v1/extract.html
//-----------------------------------------------------------------------------
(function() {

// パッチ専用の別ID
const POT_YAHOO_API_ID = '9flBbkmxg65fr3wMSVZkeLl7ohRqT_sLtPTn_uNWC2Whdv4GMIXAVeGc3aVXj0_YffhvaPE-';

update(models.Yahoo, {
    // 元は変えずに別のObjectで拡張 (API制限)
    Pot: {
        name: 'Yahoo',
        APP_ID: POT_YAHOO_API_ID,
        
        parse: function(ps) {
            const url = 'http://jlp.yahooapis.jp/MAService/V1/parse';
            ps.appid = this.APP_ID;
            return request(url, {
                charset: 'utf-8',
                sendContent: ps
            }).addCallback(function(res) {
                return convertToXML(res.responseText);
            });
        },
        /**
         * 形態素解析
         */
        morphemize: function(string) {
            var self = this, result = [],  d, df;
            df = new Deferred();
            d = this.explode(string, 'parse');
            d.addCallback(function(chars) {
                chars.forEach(function(s) {
                    df.addCallback(function() {
                        return self.parse({
                            sentence: Pot.StringUtil.stringify(s),
                            response: 'surface,pos'
                        }).addCallback(function(res) {
                            var surface;
                            surface = list(res.ma_result.word_list.word.surface);
                            list(res.ma_result.word_list.word.pos).forEach(function(p, i) {
                                result.push({
                                    surface: surface[i].toString(),
                                    pos: p.toString()
                                });
                            });
                            return wait(0);
                        });
                    });
                });
                df.addCallback(function() {
                    return result;
                });
                df.callback();
                return df;
            }).addCallback(function(res) {
                return res;
            });
            return d;
        },
        /**
         * キーワード解析
         */
        keywordize: function(string) {
            const url = 'http://jlp.yahooapis.jp/KeyphraseService/V1/extract';
            var self = this, result = [], d, df;
            df = new Deferred();
            d = this.explode(string, 'keyword');
            d.addCallback(function(chars) {
                chars.forEach(function(s) {
                    df.addCallback(function() {
                        return request(url, {
                            charset: 'utf-8',
                            sendContent: {
                                appid: self.APP_ID,
                                output: 'json',
                                sentence: Pot.StringUtil.stringify(s)
                            }
                        }).addCallback(function(res) {
                            var words = JSON.parse(res.responseText);
                            forEach(words, function([name, score]) {
                                var i = parseInt(score) || 50;
                                while (typeof result[i] === 'string') {
                                    i++;
                                }
                                result[i] = name;
                            });
                            return wait(0);
                        });
                    });
                });
                df.addCallback(function() {
                    var results = [], item, clean, invalid, dp;
                    clean = /[,\s\u00A0\u3000]+/g;
                    // 数字/記号だけorマルチバイト1文字だけはダメ
                    invalid = /^[!-@[-`\]{-~}\s]+$|^[\u0100-\uFFFF]$/;
                    dp = Pot.DeferredUtil.repeat(result.length, function(idx) {
                        Pot.ArrayUtil.emptyFilter(Pot.StringUtil.
                            trim(result[idx]).split(clean)).forEach(function(v) {
                            item = Pot.StringUtil.trim(v).replace(clean, '');
                            if (item && item.length && !invalid.test(item)) {
                                results[results.length] = item;
                            }
                        });
                        return succeed();
                    }).addCallback(function() {
                        result = Pot.ArrayUtil.unique(results);
                        return result;
                    });
                    dp.callback();
                    return dp;
                });
                df.callback();
                return df;
            }).addCallback(function(res) {
                return res;
            });
            return d;
        },
        /**
         * かな読みに変換
         */
        getKanaReadings: function(string) {
            var self = this, result = [],  d, df;
            df = new Deferred();
            d = this.explode(string, 'parse');
            d.addCallback(function(chars) {
                chars.forEach(function(s) {
                    df.addCallback(function() {
                        return self.parse({
                            sentence: Pot.StringUtil.stringify(s),
                            response: 'reading'
                        }).addCallback(function(res) {
                            Array.prototype.push.apply(result, list(res.ma_result.word_list.word.reading));
                            return wait(0);
                        });
                    });
                });
                df.addCallback(function() {
                    return result;
                });
                df.callback();
                return df;
            }).addCallback(function(res) {
                return res;
            });
            return d;
        },
        getRomaReadings: function(string) {
            return this.getKanaReadings(string).addCallback(function(res) {
                var sep = Pot.StringUtil.chr(0);
                return res.join(sep).toRoma().split(sep);
            });
        },
        /**
         * 最大文字(Byte)数を超えてる場合は分割する(できるだけ単語の途中で切らない)
         */
        explode: function(string, type) {
            var d, result = [], c, size, chars, s, subs, sub, max, re, g, i, len;
            d = new Deferred();
            switch (type) {
                case 'parse':
                    max = YAHOO_API_PARSE_MAX_TEXT_SIZE;
                    break;
                case 'keyword':
                    max = YAHOO_API_KEYWORD_MAX_TEXT_SIZE;
                    break;
                default:
                    max = 1024 * 2;
                    break;
            }
            re = {
                gexp: null,
                space: '[\\s\\u00A0\\u3000]',
                graph: '[^一-龠々〆ァ-ヴｦ-ｯｱ-ﾝぁ-んﾞ゛ﾟ゜\\wａ-ｚＡ-Ｚ０-９Α-ωⅠ-Ⅹⅰ-ⅹ☆★♪\\u301Cー～－ｰ-]',
                bounds: '\\b',
                chars: '[\\s\\S]',
                remove: /[\u0000-\u0008]+/g
            };
            re.gexp = new RegExp(Pot.sprintf('^(%s*)(%s|%s)(%s{%d,%d}?(?:%s|%s|))$',
                re.chars,
                re.space, re.graph,
                re.chars, 1, 256,
                re.bounds, re.graph
            ), 'i');
            
            s = Pot.StringUtil.stringify(string).replace(re.remove, '');
            if (!s) {
                d.addCallback(function() {
                    return result;
                });
            } else {
                subs = [];
                size = 0;
                max = Math.max(960, Math.floor(max * 0.925));
                result = [];
                chars = s.split('');
                s = null;
                len = chars.length;
                i = 0;
                // ジェネレータを生成
                g = (function() {
                    while (i < len) {
                        yield i;
                        c = chars[i];
                        size += encodeURIComponent(c).length;
                        subs[subs.length] = c;
                        if (size >= max) {
                            sub = subs.join('');
                            if (re.gexp.test(sub)) {
                                sub = sub.replace(re.gexp, function(all, pre, punct, graph) {
                                    subs = [];
                                    Array.prototype.push.apply(subs, graph.split(''));
                                    size = encodeURIComponent(graph).length;
                                    return pre + punct;
                                });
                            } else {
                                subs = [];
                                size = 0;
                            }
                            result.push(sub);
                        }
                        if (++i >= len) {
                            result.push(subs.join(''));
                            subs = [];
                            size = 0;
                        }
                    }
                })();
                d.addCallback(function() {
                    return Pot.DeferredUtil.repeat(len + 1, function(n) {
                        try {
                            g.next();
                        } catch (e if e instanceof StopIteration) {
                            throw e;
                        }
                    }).addCallback(function() {
                        return result;
                    }).callback();
                }).addCallback(function() {
                    return result;
                });
            }
            return d;
        }
    }
});


})();
//-----------------------------------------------------------------------------
// Update - Yahoo! Bookmarks
//-----------------------------------------------------------------------------
(function() {


update(models.YahooBookmarks, {
    name: 'YahooBookmarks',
    ICON: 'http://bookmarks.yahoo.co.jp/favicon.ico',
    check: function(ps) {
        return Pot.BookmarkUtil.check(ps);
    },
    post: function(ps) {
        var self = this;
        return request('http://bookmarks.yahoo.co.jp/action/post').addCallback(function(res) {
            if (res.responseText.indexOf('login_form') !== -1) {
                throw new Error(getMessage('error.notLoggedin'));
            }
            return formContents($x('(id("addbookmark")//form)[1]', convertToHTMLDocument(res.responseText)));
        }).addCallback(function(fs) {
            var tags, desc, title, privateMode;
            privateMode = Pot.getPref(POT_BOOKMARK_PRIVATE);
            title = Pot.BookmarkUtil.truncateFields(self.name, 'title', ps.item);
            tags = Pot.BookmarkUtil.truncateFields(self.name, 'tagLength', Pot.BookmarkUtil.appendConstantTags(ps.tags)),
            desc = Pot.BookmarkUtil.truncateFields(self.name, 'comment', joinText([ps.body, ps.description], ' ', true));
            return request('http://bookmarks.yahoo.co.jp/action/post/done', {
                redirectionLimit: 0,
                sendContent: {
                    title: title,
                    url: ps.itemUrl,
                    desc: desc,
                    tags: joinText(tags, ' '),
                    crumbs: fs.crumbs,
                    visibility: (ps.private == null && !privateMode) ? fs.visibility :
                                        ((ps.private || privateMode) ? 0 : 1)
                }
            });
        });
    },
    /**
     * タグ、おすすめタグを取得する。
     * ブックマーク済みでも取得することができる。
     *
     * @param  {String} url 関連情報を取得する対象のページURL。
     * @return {Object}
     */
    getSuggestions: function(url) {
        return request('http://bookmarks.yahoo.co.jp/bookmarklet/showpopup', {
            queryString: {
                u: url
            }
        }).addCallback(function(res) {
            var doc = convertToHTMLDocument(res.responseText);
            if (!$x('id("bmtsave")', doc)) {
                throw new Error(getMessage('error.notLoggedin'));
            }
            function getTags(part) {
                var code, re = new RegExp('^' + Pot.escapeRegExp(part) + ' ?= ?(.+)(;|$)', 'm');
                code = unescapeHTML(res.responseText.extract(re));
                return evalInSandbox(code, 'http://bookmarks.yahoo.co.jp/') || [];
            }
            return {
                duplicated: !!$x('//input[@name="docid"]', doc),
                popular: getTags('rectags'),
                tags: getTags('yourtags').map(function(tag) {
                    return {
                        name: tag,
                        frequency: -1
                    }
                })
            };
        });
    }
});


})();
//-----------------------------------------------------------------------------
// Update - Firefox Bookmark
//-----------------------------------------------------------------------------
(function() {


if (typeof(PlacesUtils) === 'undefined') {
    Components.utils.import('resource://gre/modules/utils.js');
}

update(models.FirefoxBookmark, {
    name: 'FirefoxBookmark',
    ICON: 'chrome://tombloo/skin/firefox.ico',
    ANNO_DESCRIPTION: 'bookmarkProperties/description',
    check: function(ps) {
        return Pot.BookmarkUtil.check(ps);
    },
    addBookmark: function(uri, title, tags, description) {
        var self = this, ps, folder, bs = NavBookmarksService, index = bs.DEFAULT_INDEX;
        
        // ハッシュタイプの引数か?
        if (typeof(uri) === 'object' && !(uri instanceof IURI)) {
            if (uri.index != null) {
                index = uri.index;
            }
            folder = uri.folder;
            title = uri.title;
            tags = uri.tags;
            description = uri.description;
            uri = uri.uri;
        }
        ps = {
            item: title,
            itemUrl: (uri && uri.uri) ? uri.uri : uri
        };
        return Pot.BookmarkUtil.fixURI(ps).addCallback(function(newps) {
            title = newps.item;
            uri = createURI(newps.itemUrl);
            
            // 既存のタグとの差分をとりユニークにして重複を防ぐ
            //
            //XXX: もしかしたら今後不要になるかも
            //
            tags = Pot.ArrayUtil.diff(
                Pot.ArrayUtil.unique(Pot.BookmarkUtil.normalizeTags(tags)),
                Pot.ArrayUtil.unique(self.getBookmarkTagsByURI(ps.itemUrl))
            );
            
            // フォルダが未指定の場合は未整理のブックマークになる
            folder = (!folder) ? bs.unfiledBookmarksFolder : self.createFolder(folder);
            
            // 同じフォルダにブックマークされていないか?
            // ---------------------------------------------------------------
            // #55 コメントアウト
            // ---------------------------------------------------------------
            //if (!bs.getBookmarkIdsForURI(uri, {}).some(function(item) {
            //    return bs.getFolderIdForItem(item) == folder;
            //})) {
                
                let folders, created = false;
                
                // ここでPOST時にダイアログが固まるので非ブロックで処理する
                callLater(0, function() {
                    folders = [folder].concat(tags.map(bind('createTag', self)));
                    created = true;
                });
                till(function() {
                    return created !== false;
                });
                
                let d = Pot.DeferredUtil.repeat(folders.length, function(idx) {
                    bs.insertBookmark(folders[idx], uri, index, title);
                }).addCallback(function() {
                    self.setDescription(uri, description);
                    return succeed(uri);
                });
                d.callback();
                return d;
            //}
            //self.setDescription(uri, description);
            //return succeed(uri);
        });
    },
    post: function(ps) {
        var self = this, title, tags, comment;
        // POSTボタン押したあと硬直するのでwaitをいれる
        return wait(0).addCallback(function() {
            title = Pot.BookmarkUtil.truncateFields(self.name, 'title', ps.item);
            tags = Pot.BookmarkUtil.truncateFields(self.name, 'tagLength', Pot.BookmarkUtil.appendConstantTags(ps.tags));
            comment = Pot.BookmarkUtil.truncateFields(self.name, 'comment', ps.description);
        }).addCallback(function() {
            return self.addBookmark(
                ps.itemUrl,
                title,
                tags,
                comment
            ).addCallback(function() {
                // オートコンプリートで使うタグをリセット
                Pot.QuickPostForm.resetCandidates();
            });
        });
    },
    getBookmark: function(uri) {
        uri = createURI(uri);
        var item = this.getBookmarkId(uri);
        if (item) {
            return {
                title: NavBookmarksService.getItemTitle(item),
                uri: uri.asciiSpec,
                description: this.getDescription(item)
            };
        }
    },
    isBookmarked: function(uri) {
        var bookmarked = this.getBookmarkId(uri) != null;
        return succeed(bookmarked);
        
        // 存在しなくてもtrueが返ってくるようになり利用できない
        // return NavBookmarksService.isBookmarked(createURI(uri));
    },
    removeBookmark: function(uri) {
        this.removeItem(this.getBookmarkId(uri));
    },
    removeItem: function(itemId) {
        NavBookmarksService.removeItem(itemId);
    },
    getBookmarkId: function(uri) {
        if (typeof(uri) === 'number') {
            return uri;
        }
        uri = createURI(uri);
        return NavBookmarksService.getBookmarkIdsForURI(uri, {}).filter(function(item) {
            while (item = NavBookmarksService.getFolderIdForItem(item)) {
                if (item == NavBookmarksService.tagsFolder) {
                    return false;
                }
            }
            return true;
        })[0];
    },
    getDescription: function(uri) {
        try {
            return AnnotationService.getItemAnnotation(this.getBookmarkId(uri), this.ANNO_DESCRIPTION);
        } catch (e) {
            return '';
        }
    },
    setDescription: function(uri, description) {
        if (description == null) {
            return;
        }
        description = description || '';
        try {
            AnnotationService.setItemAnnotation(this.getBookmarkId(uri), this.ANNO_DESCRIPTION, description, 
                0, AnnotationService.EXPIRE_NEVER);
        } catch (e) {}
    },
    createTag: function(name) {
        return this.createFolder(name, NavBookmarksService.tagsFolder);
    },
    /*
    // -- old --
    createFolder: function(name, parent) {
        parent = parent || NavBookmarksService.bookmarksMenuFolder;
        return NavBookmarksService.getChildFolder(parent, name) || 
               NavBookmarksService.createFolder(parent, name, NavBookmarksService.DEFAULT_INDEX);
    },
    */
    /*
    NavBookmarksServiceに予め存在するフォルダID
        placesRoot
        bookmarksMenuFolder
        tagsFolder
        toolbarFolder
        unfiledBookmarksFolder
    */
    /**
     * フォルダを作成する。
     * 既に同名のフォルダが同じ場所に存在する場合は、新たに作成されない。
     *
     * @param {String} name フォルダ名称。
     * @param {Number} parentId 
     *        フォルダの追加先のフォルダID。省略された場合ブックマークメニューとなる。
     * @return {Number} 作成されたフォルダID。
     */
    createFolder: function(name, parentId) {
        parentId = parentId || NavBookmarksService.bookmarksMenuFolder;
        return this.getFolder(name, parentId) ||
            NavBookmarksService.createFolder(parentId, name, NavBookmarksService.DEFAULT_INDEX);
    },
    /**
     * フォルダIDを取得する。
     * 既に同名のフォルダが同じ場所に存在する場合は、新たに作成されない。
     *
     * @param {String} name フォルダ名称。
     * @param {Number} parentId 
     *        フォルダの追加先のフォルダID。省略された場合ブックマークメニューとなる。
     */
    getFolder: function(name, parentId) {
        parentId = parentId || NavBookmarksService.bookmarksMenuFolder;
        let query = NavHistoryService.getNewQuery();
        let options = NavHistoryService.getNewQueryOptions();
        query.setFolders([parentId], 1);
        let root = NavHistoryService.executeQuery(query, options).root;
        try {
            root.containerOpen = true;
            
            let result = null, i = 0;
            
            // タグやフォルダ数が増えてくると固まるようになるのでDeferredでループする
            Pot.DeferredUtil.repeat(root.childCount, function(i) {
                let node = root.getChild(i);
                if (node.type === node.RESULT_TYPE_FOLDER && node.title === name) {
                    result = node.itemId;
                    throw StopIteration;
                }
            }).addCallback(function() {
                if (result === null) {
                    result = undefined;
                }
            }).callback();
            
            // Deferredループが終わるまで非ブロックで待機
            // (本当は他のメソッドと共にDeferredで返すようにしたい)
            if (++i % 3 === 0 || result === null) {
                till(function() {
                    return result !== null;
                });
            }
            return result;
        } finally {
            root.containerOpen = false;
        }
    },
    /**
     * URIに関連付けられたタグを取得する
     *
     * @param  {String}  uri
     * @return {Object}  Deferred
     */
    getBookmarkTagsByURI: function(uri) {
        var tags = PlacesUtils.tagging.getTagsForURI(PlacesUtils._uri(uri), {});
        return succeed().addCallback(function() {
            return Pot.BookmarkUtil.normalizeTags(tags);
        });
    },
    getBookmarkDescriptionByURI: function(uri) {
        var self = this;
        return succeed().addCallback(function() {
            return self.getDescription(uri);
        });
    },
    getSuggestions: function(url) {
        var self = this, tags = [], allTags = PlacesUtils.tagging.allTags;
        allTags.forEach(function(tag) {
            tags.push({
                name: tag,
                frequency: -1
            });
        });
        return self.isBookmarked(url).addCallback(function(duplicated) {
            return {
                duplicated: duplicated,
                recommended: [],
                tags: tags
            };
        });
    }
});


})();
//-----------------------------------------------------------------------------
// Update - tagProvider
//-----------------------------------------------------------------------------
(function() {


Pot.extend({
    tagProvider: (function(tag) {
        return (tag && (tag in models)) ? models[tag] : {};
    })(getPref('tagProvider'))
});


})();
//-----------------------------------------------------------------------------
// Bookmark - Tombloo.Service.extractors.Bookmark
//-----------------------------------------------------------------------------
(function() {

// Bookmark メニューを一番下に追加
Tombloo.Service.extractors.register([{
    name: 'Bookmark',
    ICON: 'chrome://tombloo/skin/star.png',
    check: function(ctx) {
        this.changeICON(ctx.href);
        return ctx.href && ctx.href.length > 0;
    },
    iconCache: {
        org: null,
        gray: null
    },
    // コンテキストメニューを開いたときにブックマーク済みなら色好きアイコン
    // 未ブックマークならグレーのアイコンを表示する
    //
    // ローカル(FirefoxBookmark)以外は非同期通信が間に合わない可能性アリ
    // その場合たぶんメニューを2回目に開いたときに反映されてる
    // (無駄な通信な気もするので処理を検討中)
    //
    changeICON: function(url) {
        var self = this;
        if (Pot.tagProvider && Pot.tagProvider.isBookmarked && url) {
            Pot.tagProvider.isBookmarked(url).addCallback(function(bookmarked) {
                self.ICON = bookmarked ? self.iconCache.org : self.iconCache.gray;
            });
        }
    },
    initIcon: function() {
        var d, self = this;
        if (!this.iconCache.org) {
            this.iconCache.org = this.ICON;
            d = toGrayScale(this.ICON).addCallback(function(src) {
                return self.iconCache.gray = src;
            });
        }
    },
    extract: function(ctx) {
        var d, ps = {
            type: 'bookmark',
            item: ctx.title,
            itemUrl: ctx.href
        };
        if (ctx.date) {
            ps.date = ctx.date;
        }
        if (Pot.tagProvider && Pot.tagProvider.getBookmarkTagsByURI) {
            d = Pot.tagProvider.getBookmarkTagsByURI(ps.itemUrl).addCallback(function(tags) {
                ps.tags = Pot.BookmarkUtil.normalizeTags(tags);
                return ps;
            });
        } else {
            d = succeed(ps);
        }
        if (Pot.tagProvider && Pot.tagProvider.getBookmarkDescriptionByURI) {
            d = d.addCallback(function(ps) {
                return Pot.tagProvider.getBookmarkDescriptionByURI(ps.itemUrl).addCallback(function(desc) {
                    ps.description = desc || '';
                    return ps;
                });
            });
        }
        return d;
    }
}]);

// アイコンを初期化
callLater(0, function() { Tombloo.Service.extractors.Bookmark.initIcon(); });

})();
//-----------------------------------------------------------------------------
// Update - j.mp icon
//-----------------------------------------------------------------------------
(function() {

// j.mp の favicon URL が変わってるので修正
update(models['j.mp'], {
    ICON: 'http://j.mp/s/v304/graphics/favicon.png'
});


})();
//-----------------------------------------------------------------------------
// QuickPostForm / コンテキストメニュー
//-----------------------------------------------------------------------------
(function() {

const URI_PATTERN = /([a-z][a-z0-9]*:[-_.!~*'()a-z0-9;\/?:@&=+$,%#]+|[a-z0-9!#$%&'*\/=?^_`{|}~+-]+@[\w:.+-]+)/gi;

// リンク切れ修正
QuickPostForm.descriptionContextMenus.forEach(function(item) {
    if (item.name === 'j.mp') {
        item.icon = models['j.mp'].ICON;
    }
});

// ダイアログにブックマーク用プロパティを設定
update(QuickPostForm.dialog, {
    bookmark: {
        // ダイアログのサイズ
        size: {
            width: 600,
            height: 400
        }
        //,
        //expandedForm: true, // => formPanel.toggleDetail();
        //expandedTags: true  // => formPanel.tagsPanel.toggleSuggestion();
    }
});

/*
 * Update appendMenuItem
 *
 * メニューの checkbox, radio を有効にする
 */
addAround(grobal, 'appendMenuItem', function(proceed, args) {
    var result, type, checked, attrs;
    var [menu, label, image, hasChildren] = args;
    
    if (image) {
        // 第三引数 image が String で渡されたら checkbox or radio か調べる
        //
        //  - 'checkbox:1' =>  <menuitem type="checkbox" checked="true"/>
        //  - 'checkbox:0' =>  <menuitem type="checkbox" checked="false"/>
        //
        if (Pot.isString(image) && /^(?:checkbox|radio)\b.{0,6}$/.test(image)) {
            [type, checked] = image.split(/\W+/);
            type = type.toLowerCase();
            checked = /^(?:1|on|yes|true)$/i.test(checked);
            attrs = {
                type: type,
                checked: checked
            };
            image = null;
        } else if (Pot.isObject(image)) {
            //
            // Object で渡された場合は attributes として設定
            //
            //  {type: 'checkbox', checked: true}  =>  <menuitem type="checkbox" checked="true"/>
            //
            attrs = image;
            image = null;
        }
    }
    result = proceed([menu, label, image, hasChildren]);
    if (result && attrs) {
        forEach(attrs, function([key, val]) {
            //
            // 関数だったら引数に<menuitem>自身を設定して呼び出し
            //
            result.setAttribute(key, Pot.isFunction(val) ? val.call(result, result) : val);
        });
    }
    return result;
});

// QuickPostForm関連 / メニュー拡張用メソッドを定義
Pot.extend({
    QuickPostForm: {
        // オートコンプリートで使うタグをリセット
        resetCandidates: function() {
            QuickPostForm.candidates = [];
        },
        /**
         * 呼び出し元から指定の名前(name)を持つメニューを取得
         *
         * @param  {Object}    caller    呼び出し元のthisオブジェクト
         * @param  {String}    name      メニューの名前 (name)
         * @param  {Number}   (count)    同じ名前があるとき何番目のメニューか (0 = 最初)
         * @return {Object}              メニューアイテム or undefined
         */
        getMenuItemByCaller: function(caller, name, count) {
            var result, menu, menus, cnt, i, len;
            cnt = Pot.isNumeric(count) ? Number(count) : 0;
            menus = caller.customMenus.filter(function(menu) {
                return menu && (menu.name === name || menu.label === name);
            });
            if (menus.length <= 1) {
                result = menus.shift();
            } else {
                len = menus.length;
                for (i = 0; i < len; i++) {
                    menu = menus[i];
                    if (menu && (menu.name === name ||
                                menu.label === name) && --cnt < 0) {
                        result = menu;
                        break;
                    }
                }
            }
            return result;
        },
        /**
         * 指定のメニューの関数を実行して返す (返せる場合)
         *
         * @example  callDescriptionContextMenu('ノイズを除去', 'test text AD:hoge');
         * @results  'test text'
         *
         * @param  {String}  name   メニューの名前 (name)
         * @param  {Mixed}   value  対象の値
         * @return {Mixed}          結果の値
         */
        callDescriptionContextMenu: function(name, value) {
            var item, desc, d;
            item = Pot.QuickPostForm.getDescriptionContextMenu(name);
            if (item && item.execute && Pot.isFunction(item.execute)) {
                desc = {value: value};
                // Deferred は考慮していない
                d = item.execute({}, desc);
                value = desc.value;
            }
            return value;
        },
        /**
         * 指定の名前(name)を持つメニューを取得。
         *
         * @param  {String}    name      メニューの名前 (name)
         * @param  {Number}   (count)    同じ名前があるとき何番目のメニューか (0 = 最初)
         * @param  {Function}  callback  (internal)
         * @return {Object}              メニューアイテム or undefined
         */
        getDescriptionContextMenu: function(name, count, callback) {
            var result, item, func, cnt, t;
            if (Pot.isFunction(count)) {
                t = callback;
                func = count;
                cnt = t;
            } else {
                func = callback;
                cnt = count;
            }
            func = Pot.isFunction(func) ? func : (function() {});
            cnt = Pot.isNumeric(cnt) ? Number(cnt) : 0;
            try {
                (function(m) {
                    var i = 0;
                    for each (item in m) {
                        if (item && item.name) {
                            if (item.children && item.children.length) {
                                arguments.callee(item.children);
                            }
                            if (!result && item.name === name && --cnt < 0) {
                                result = update({}, item);
                                result.result = func.call(m, m, item, i);
                            }
                            if (result) {
                                throw 'break';
                            }
                        }
                        i++;
                    }
                })(QuickPostForm.descriptionContextMenus);
            } catch (e) {}
            return result;
        },
        /**
         * 新しいメニューを指定のメニューの前(上) or 後ろ(下)に追加する
         *
         * @param  {Object}   menu       追加するメニューアイテム (name必須)
         * @param  {String}   name       基準とするメニューの名前(name)
         * @param  {Number}   (count)    同じ名前があるとき何番目のメニューか (0 = 最初)
         * @param  {Boolean}  (after)    後ろ(下)に追加する場合 = true
         * @return {Boolean}  result     成功 or 失敗
         */
        insertBeforeMenuItem: function(menu, name, count, after) {
            var result = false;
            if (menu && Pot.isObject(menu)) {
                Pot.QuickPostForm.getDescriptionContextMenu(name, count, function(menus, item, idx) {
                    menus.splice(idx + (after ? 1 : 0), 0, menu);
                    result = true;
                });
            }
            return result;
        },
        /**
         * 指定の名前(name)を持つメニューを削除。
         *
         * @param  {String}    name      メニューの名前 (name)
         * @param  {Number}   (count)    同じ名前があるとき何番目のメニューか (0 = 最初)
         * @return {Boolean}   result    成功 or 失敗
         */
        removeMenuItem: function(name, count) {
            var result = false;
            Pot.QuickPostForm.getDescriptionContextMenu(name, count, function(menus, item, idx) {
                menus.splice(idx, 1);
                result = true;
            });
            return result;
        }
    }
});


// コンテキストメニューを追加
// (無駄に多いよ...)
QuickPostForm.descriptionContextMenus.push(
    {
        name: '----'
    },
    {
        // flavors設定時のみ適応のメニュー
        name: 'テキストとHTMLを切り替え',
        icon: 'data:image/png,0',
        check: function(ps, type) {
            return ps && type && ps[type] !== undefined &&
                   ps[type].flavors && ps[type].flavors.html !== undefined;
        },
        execute: (function() {
            var toDataURI, toggleIcon, icons = {text: null, html: null};
            toDataURI = function(s, type) {
                return Pot.sprintf('data:image/%s;base64,%s', type || 'png', s);
            };
            toggleIcon = function(menu) {
                menu.icon = menu.icon === icons.text ? icons.html : icons.text;
            };
            // icon: http://www.famfamfam.com/
            icons.text = icons.html = toDataURI(Pot.StringUtil.trimAll(<>
                iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6
                QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAHUSURBVDjLxZ
                M7a1RhEIafc3J2z6qJkIuCKChItBNSBQ0iIlZiK4gWItj6HwRbC7FRf4CVnSCIkH9
                gJVjYiCDximCyZ7/zfXOz2A0I2qVwmmFg3rm870wVEezFavZoey7Q3Hv+/Z87qDsi
                TlZFBJIGKStZlFSCTpyUlAZgfXXfH9BAPTCberVANBB3RAJRR8wp6jzd/DotALA9U
                cyZgZxis2QNijpZjSJBVqeIszTfkMY65cAjuHxmgSzGlbUFrp1d5ObGErcuLLNxep
                5hU3H93AqjYcXti4cZZ2OSDU9CnVURddqmIovTDmoev/5GVcGDF585tjzg1JGWo0t
                DDgxrThxq6XojieOd0nRZ6dVpBxU3zi/T1BVdViKCcTbcYX11ngB6cca9MSlGlpro
                jHqcglycVJyHL79Q1Jn0TgBdb1gEbz9OeL81IYsRAakYvQSeC/WvVOiLE8GsM4xnv
                suGe/Do1RY/dpRenIP753hyZxURJ3JQXbr/Lq6uLfLpZ6aIk9XJssv8VK5dNcQcmc
                l7fKVl89kHmu0dJRVjYTRHGVSMpELaQLVCtEY8EAvMHHUwn067+0LVybtvok9KSOD
                ZiaKEOJENihPm01gD3P+62Oq/f+Nv2d9y2D8jLUEAAAAASUVORK5CYII=
            </>.toString()));
            // 初期化用にPotオブジェクトを経由する
            Pot.QuickPostForm.switchTextItemHelper = function() {
                toGrayScale(icons.html).addCallback(function(data) {
                    icons.text = data;
                    Pot.QuickPostForm.getDescriptionContextMenu('テキストとHTMLを切り替え', function(menus, item, idx) {
                        item.icon = icons.text;
                    });
                    return true;
                });
            };
            return function(elmText, desc, caller, ps, type) {
                var result, mode;
                try {
                    if (this.icon === icons.text) {
                        ps[type].flavors.plain = desc.value;
                        result = getFlavor(ps[type], 'html');
                    } else {
                        if (ps[type].flavors.plain === undefined) {
                            ps[type].flavors.plain = Pot.StringUtil.stringify(ps[type]) || desc.value;
                        }
                        result = ps[type].flavors.plain;
                    }
                } catch (e) {
                    result = desc.value;
                } finally {
                    toggleIcon(this);
                }
                desc.value = Pot.StringUtil.stringify(result);
            };
        })()
    },
    {
        name: '----',
        check: function(ps, type) {
            return ps && type && ps[type] !== undefined &&
                   ps[type].flavors && ps[type].flavors.html !== undefined;
        }
    },
    {
        name: 'キーワード抽出',
        execute: function(elmText, desc) {
            var d, df, text, doc;
            d = new Deferred();
            df = new Deferred();
            doc = Pot.getDocument();
            text = Pot.StringUtil.stringify(desc.value);
            desc.value = Pot.sprintf('処理中…\n\n%s', text);
            d.addCallback(function() {
                if (!text) {
                    text = Pot.getTextContent(doc);
                }
                if (doc) {
                    text = new Array(9).join(' ' + (doc.title || $x('//title/text()', doc) || '')) + text;
                }
                return text;
            }).addCallback(function(s) {
                return Pot.QuickPostForm.callDescriptionContextMenu('ノイズを除去', s);
            }).addCallback(function(s) {
                return Pot.StringUtil.toZenkanaCase(
                    Pot.StringUtil.toHanSpaceCase(
                        Pot.StringUtil.toHankakuCase(
                            Pot.StringUtil.trim(
                                Pot.StringUtil.stringify(s).
                                    replace(/[\u0000-\u001F\s\u00A0\u3000]+/g, ' ').
                                    replace(/\s+/g, ' ').
                                    replace(/([^一-龠々〆ヵヶァ-ヴｦ-ｯｱ-ﾝﾞﾟぁ-ん]){1,2}(?:\s*\1\s*){3,}/g, '$1')
                            )
                        )
                    )
                );
            }).addCallback(function(s) {
                return Yahoo.Pot.keywordize(s).addCallback(function(res) {
                    df.callback();
                    desc.value = Pot.StringUtil.trim(res.join(' '));
                }).callback();
            });
            callLater(0.125, function() { d.callback(); });
            return df;
        }
    },
    {
        name: 'マルコフ連鎖で要約',
        execute: (function() {
            var summarize, removeNoise;
            summarize = function(s) {
                let mc;
                try {
                    mc = new Pot.MarkovChainer();
                    //TODO: APIで形態素解析
                    return Pot.StringUtil.stringify(mc.summarize(s));
                    //return mc.morphemize(s).join(' | ');
                } finally {
                    mc.clear();
                    mc = null;
                }
            };
            removeNoise = function(s) {
                return Pot.QuickPostForm.callDescriptionContextMenu(
                    'ノイズを除去', Pot.StringUtil.remove2chName(s));
            };
            return function(elmText, desc) {
                var d, df, value, prev;
                d = new Deferred();
                df = new Deferred();
                value = prev = Pot.StringUtil.trim(desc.value);
                desc.value = Pot.sprintf('処理中…\n\n%s', value);
                d.addCallback(function() {
                    if (!value) {
                        value = Pot.getTextContent();
                    }
                    return value;
                }).addCallback(function(v) {
                    return removeNoise(v);
                }).addCallback(function(v) {
                    v = summarize(v);
                    if (v === prev ||
                        (String(v).length <= String(prev).length && Pot.rand(0, 1))) {
                        return succeed().addCallback(function() {
                            return Pot.getTextContent() || v;
                        }).addCallback(function(v) {
                            return removeNoise(v);
                        }).addCallback(function(v) {
                            return summarize(v);
                        });
                    } else {
                        return succeed(v);
                    }
                }).addCallback(function(v) {
                    df.callback();
                    desc.value = v;
                });
                callLater(0.125, function() { d.callback(); });
                return df;
            };
        })()
    },
    {
        name: '----'
    },
    {
        name: 'テキスト整形',
        children: [
        {
            // ホワイトスペースを詰める。単語の途中では折り返さない。
            // となり同士が単語と単語(となりうる記号)の時のみスペースを入れる (minify)
            name: '改行とホワイトスペースを詰める',
            execute: function(elmText, desc) {
                var value, c, uris = [], restore, re = {
                    space: /[\s\u00A0\u3000]/g,
                    split: /([\s\S])[\s\u00A0\u3000]+([\s\S])/g,
                    bounds: /[$@#\w\\<>{}*+-]/,
                    tail: /([\s\S]{76,260}(?:[,.､、，。！!？?]+|[；：…‥】」》）』”］〉〕｝]+|[\s\u3000;:?(){}[\]<>]+))/g
                };
                value = Pot.StringUtil.stringify(desc.value);
                if (value && value.length) {
                    
                    // URI の途中では折り返さない
                    if (URI_PATTERN.test(value)) {
                        c = '';
                        do {
                            c += String.fromCharCode(Pot.rand(65, 90), Pot.rand(97, 122));
                        } while (value.indexOf(c) !== -1);
                        
                        value = value.replace(URI_PATTERN, function(uri) {
                            uris.push(uri);
                            return c + uris.length + c;
                        });
                        restore = function(s) {
                            re.restore = new RegExp([c, c].join('([0-9]+)').wrap('([\\s\\S]|)'), 'g');
                            try {
                                return s.replace(re.restore, function(m0, left, idx, right) {
                                    var index = idx - 1, open = '(', close = ')', enclosed = false;
                                    try {
                                        if (left === open) {
                                            if (uris[index].slice(-1) === close) {
                                                right = uris[index].slice(-1) + right;
                                                uris[index] = uris[index].slice(0, -1);
                                            } else if (uris[index].slice(-2, -1) === close && /^[,.:;!?]$/.test(uris[index].slice(-1))) {
                                                right = uris[index].slice(-2) + right;
                                                uris[index] = uris[index].slice(0, -2);
                                            }
                                        }
                                        if (left.slice(-1) === '<' && right.charAt(0) === '>') {
                                            enclosed = true;
                                        }
                                        return [
                                            left,
                                            (enclosed || re.space.test(left.slice(-1))) ? '' : ' ',
                                            uris[index],
                                            (enclosed || re.space.test(right.charAt(0))) ? '' : ' ',
                                            right
                                        ].join('');
                                    } finally {
                                        uris[index] = null;
                                    }
                                });
                            } finally {
                                delete re.restore;
                                uris = [];
                            }
                        };
                    }
                    value = value.replace(re.split, function(m0, left, right) {
                        return (re.bounds.test(left) && re.bounds.test(right)) ? left + ' ' + right : left + right;
                    }).replace(re.tail, '$1\n');
                    
                    if (restore) {
                        value = restore(value);
                    }
                    value = Pot.StringUtil.trim(
                        value.split(/[\r\n]+/).map(function(line) {
                            return Pot.StringUtil.trim(line);
                        }).filter(function(line) {
                            return line && line.length > 0;
                        }).join('\n').replace(/(\r\n|\r|\n){2,}/g, '$1')
                    );
                }
                desc.value = value || '';
            }
        },
        {
            name: '----'
        },
        {
            /**
             * テキストを変換した際に「簡易はてな記法」に偶然ならないようにする
             *
             * ------------------------------------------------------------------
             * id記法        id:～, id:～:20090101, id:～:20090101:タグ名
             * search記法    [search:～], [search:asin:～], [search:question:～], [amazon:～]
             * antenna記法   a:id:～
             * bookmark記法  b:id:～, b:id:～:favorite, b:id:～:20090101, b:id:～:タグ名, [b:keyword:～], [b:t:～], [b:id:～:t:～]
             * diary記法     d:id:～, d:id:～:20090101, d:id:～:about, d:id:～:archive, [d:keyword:～]
             * fotolife記法  f:～, f:id:～:20090814090030:image
             * group記法     g:～:bbs:12345, g:～:id:～, g:～:id:～:20090101, [g:～:keyword:～]
             * haiku記法     [h:keyword:～], h:id:～
             * idea記法      i:id:～, [i:t:～], idea:12345
             * asin記法      asin:～
             * http記法      http://～
             * mailto記法    mailto:～
             * Google記法    [google:～], [google:news:～], [google:images:～]
             * Twitter記法   @～
             * ------------------------------------------------------------------
             * /([abdfghit]|id|bbs|search|favorite|about|archive|idea|asin|question|amazon|google|news|images?|keyword):/
             *
             */
            name: 'はてな記法から回避',
            execute: function(elmText, desc) {
                var s = Pot.StringUtil.stringify(desc.value), patterns = [
                    {
                        // 一般的なプロトコルは残す
                        //
                        // スペース入れるか迷ったけど全角のほうが変更されたと明確に分かる
                        //
                        by: /(?!(?:(?:http|ftp)s?|javascript|file|data))(\b(?:\w+)\b):/gi,
                        to: '$1：'
                    },
                    {
                        by: /:(?!(?:(?:http|ftp)s?|javascript|file|data))(\b(?:\w+)\b)/gi,
                        to: '：$1'
                    },
                    {
                        by: /@(\w+)/g,
                        to: '＠$1'
                    }
                ], getCutLength = function(string) {
                    var tops = [], toplen, c, chars, len, maxsize, size;
                    const def = 1000;
                    chars = string.split('');
                    len = chars.length;
                    maxsize = MAX_LENGTH.HatenaBookmark.comment;
                    if (!Pot.isNumeric(maxsize)) {
                        maxsize = def;
                    }
                    maxsize = Math.max(0, maxsize);
                    while (--len >= 0) {
                        tops.push(chars.shift());
                        size = Pot.StringUtil.getByteSize(tops.join(''));
                        if (!Pot.isNumeric(size)) {
                            toplen = def;
                            break;
                        }
                        if (size > maxsize) {
                            toplen = tops.length;
                            break;
                        }
                    }
                    return (Pot.isNumeric(toplen) && toplen > 0) ? toplen : def;
                }, cutLength = getCutLength(s);
                patterns.forEach(function(re) {
                    s = s.slice(0, cutLength).replace(re.by, re.to) + s.slice(cutLength);
                });
                desc.value = s;
            }
        },
        {
            name: '----'
        },
        {
            name: '先頭と末尾のホワイトスペースを除去(trim)',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.trim(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: '2つ以上の改行を1つに変換',
            execute: function(elmText, desc) {
                var re = {
                    singleNL: /(?:\r\n|\r|\n)/g,
                    multiNL: /(?:\r\n|\r|\n){2,}/g
                };
                desc.value = Pot.StringUtil.trim(
                    Pot.StringUtil.stringify(desc.value).split(re.singleNL).map(function(s) {
                        var t = Pot.StringUtil.trim(s);
                        return (t && t.length) ? Pot.StringUtil.rtrim(s) : t;
                    }).join('\n').split(re.multiNL).join('\n\n')
                );
            }
        },
        {
            name: 'すべての改行を1つに変換',
            execute: function(elmText, desc) {
                var re = {
                    singleNL: /(?:\r\n|\r|\n)/g,
                    multiNL: /(?:\r\n|\r|\n){1,}/g
                };
                desc.value = Pot.StringUtil.trim(
                    Pot.StringUtil.stringify(desc.value).split(re.singleNL).map(function(s) {
                        var t = Pot.StringUtil.trim(s);
                        return (t && t.length) ? Pot.StringUtil.rtrim(s) : t;
                    }).join('\n').split(re.multiNL).join('\n')
                );
            }
        },
        {
            name: 'すべての改行を除去',
            execute: function(elmText, desc) {
                var value, re = {
                    nl: /(?:\r\n|\r|\n)/g,
                    bounds: /[$@#\w\\<>{}*+-]/,
                    join: /(.)(?:\r\n|\r|\n)(.)/g
                };
                value = Pot.StringUtil.stringify(desc.value).split(re.nl).map(function(s) {
                    var t = Pot.StringUtil.trim(s);
                    return (t && t.length) ? Pot.StringUtil.rtrim(s) : t;
                }).filter(function(s) {
                    return s && s.length > 0;
                }).join('\n').replace(re.join, function(all, left, right) {
                    var glue = '';
                    if (re.bounds.test(left) && re.bounds.test(right)) {
                        glue = ' ';
                    }
                    return [left, right].join(glue);
                });
                desc.value = Pot.StringUtil.trim(value);
            }
        },
        {
            name: '----'
        },
        {
            name: '左側のホワイトスペースを除去(ltrim)',
            execute: function(elmText, desc) {
                var value = Pot.StringUtil.stringify(desc.value);
                value = Pot.StringUtil.trim(
                    value.split(/(?:\r\n|\r|\n)/).map(function(s) {
                        return Pot.StringUtil.ltrim(s);
                    }).filter(function(s) {
                        return s && s.length > 0;
                    }).join('\n')
                );
                desc.value = value;
            }
        },
        {
            name: '右側のホワイトスペースを除去(rtrim)',
            execute: function(elmText, desc) {
                var value = Pot.StringUtil.stringify(desc.value);
                value = Pot.StringUtil.trim(
                    value.split(/(?:\r\n|\r|\n)/).map(function(s) {
                        return Pot.StringUtil.rtrim(s);
                    }).filter(function(s) {
                        return s && s.length > 0;
                    }).join('\n')
                );
                desc.value = value;
            }
        },
        {
            name: '両側のホワイトスペースを除去(trim)',
            execute: function(elmText, desc) {
                var value = Pot.StringUtil.stringify(desc.value);
                value = Pot.StringUtil.trim(
                    value.split(/(?:\r\n|\r|\n)/).map(function(s) {
                        return Pot.StringUtil.trim(s);
                    }).filter(function(s) {
                        return s && s.length > 0;
                    }).join('\n')
                );
                desc.value = value;
            }
        },
        {
            name: '----'
        },
        {
            name: 'HTMLタグを除去',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stripTags(Pot.StringUtil.stringify(desc.value)).split(/(?:\r\n|\r|\n)+/).map(function(s) {
                    return Pot.StringUtil.rtrim(s);
                }).filter(function(s) {
                    return s && s.length > 0;
                }).join('\n');
            }
        },
        {
            name: 'ノイズを除去',
            execute: function(elmText, desc) {
                var s, patterns = [
                    {
                        // 不正な文字を削除
                        by: /[\u0000-\u001F\s\u00A0\u3000]+/g,
                        to: ' '
                    },
                    {
                        // ADを削除
                        by: /\b(?:AD|PR|ＡＤ｜ＰＲ)\s*[:：]\s*(?:[^\r\n]+[\r\n]+|)/gi,
                        to: ' '
                    },
                    {
                        by: /\b(?:Ads[\u0020\u3000]+by[\u0020\u3000]+Google)\b/gi,
                        to: ' '
                    },
                    {
                        by: /^[\u0020\u3000]*twitterにこのエントリー?を追加[\u0020\u3000]*$/gim,
                        to: ' '
                    },
                    {
                        by: /^[\u0020\u3000]*コメントをどうぞ[\u0020\u3000]*/m,
                        to: ' '
                    },
                    {
                        by: /(?:^|\b)[\u0020\u3000]*\b(?:Ads[\u0020\u3000]*by[\u0020\u3000]*Google)\b/gim,
                        to: ' '
                    },
                    {
                        by: /^[\u0020\u3000]*この.{1,12}を一番乗りで「Like」しませんか[\u0020\u3000]*[?？]?[\u0020\u3000]*/im,
                        to: ' '
                    },
                    {
                        by: /^[\u0020\u3000]*[<>]+[\u0020\u3000]*利用規約[\u0020\u3000]*[<>]+[\u0020\u3000]*使い方はこちら[\u0020\u3000]*$/gim,
                        to: ' '
                    },
                    {
                        by: /(?:(?:印刷)+用画面を開く|ブログに利用このエントリー?をブログに利用|twitter[\u0020]*にこのエントリー?を追加)/gi,
                        to: ' '
                    },
                    {
                        by: /(?:>+[\u0020\u3000]*利用規約[\u0020\u3000]*>+)[\u0020\u3000]*(?:使い方はこちら|)/,
                        to: ' '
                    },
                    {
                        // ブックマークボタンの表記を削除
                        by: new RegExp(Pot.StringUtil.trimAll(<><![CDATA[
                            (?:
                                (?:このエントリー?を|)
                                [\u0020\u3000]*
                                (?:(?:はてな|Yahoo!)ブックマーク|del\.?icio\.?us|livedoorクリップ|Buzzurl)に(?:追加|登録)
                                [\u0020\u3000]*
                            )+
                        ]]></>), 'gi'),
                        to: ' '
                    },
                    {
                        // はてなダイアリーのノイズを削除
                        by: /\b(?:CommentsAdd[\u0020\u3000]+\w{6,}|\w{24,})\b/gi,
                        to: ' '
                    },
                    {
                        // ツイートボタン、はてなボタンのテキスト表示を削除
                        by: /\b(?:Tweet\s+Search|(?:[BＢ][!！]?|)\s+\d+\s+users)\b(?![\s\u3000,.、。!！?？]*[ぁ-ん])/gi,
                        to: ' '
                    },
                    {
                        // IPアドレスを削除
                        by: /\b(?:[\d０-９]{1,3}[.．]){2}[\d０-９]{1,3}[.．]?\b/g,
                        to: ''
                    },
                    {
                        // ソースコードの行番号だけになった数字を削除
                        by: /^\s*\d+\s*$|(?:\d+\s+){5,}/gm,
                        to: ''
                    },
                    {
                        // カレンダーを削除
                        by: /(?:\d+\s*月|Dec|Nov|Oct|Sep|Aug|Jul|Jun|May|Apr|Mar|Feb|Jan)\w*\s*(?:\(\s*\d+\s*\)|)/gi,
                        to: ' '
                    },
                    {
                        // リスト記号を削除
                        by: /\b(?:[\w※＊＋－*+-]\s+[^一-龠々〆ァ-ヴｦ-ｯｱ-ﾝぁ-ん\w\s])\b/gi,
                        to: ' '
                    },
                    {
                        // 連続した記号を削除
                        by: /(?:([^一-龠々〆ァ-ヴｦ-ｯｱ-ﾝぁ-ん\w\s]{1,4})\s+\1\s*){1,}/gi,
                        to: ' '
                    },
                    {
                        // 連続した数字を削除
                        by: /(?:(?:[(（]\s*)[\d０-９]+(?:\s*[)）]\s*)\s*)+/gi,
                        to: ' '
                    },
                    {
                        // 連続したリスト記号を削除
                        by: /(?:\b([ox※＊＋－*+-]{1,4})\s+(?:[^一-龠々〆ァ-ヴｦ-ｯｱ-ﾝぁ-ん\w\s]\s+|)(?=(?:\1\s*|$))\s*){1,}/gi,
                        to: ' '
                    },
                    {
                        // 各行のリスト記号を削除
                        by: /^[\u0020\u3000]*[^一-龠々〆ァ-ヴｦ-ｯｱ-ﾝぁ-ん\w\s]{1}[\u0020\u3000]*/gim,
                        to: ' '
                    },
                    {
                        // 同じ文字の繰り返しを削除
                        by: /\b([^一-龠々〆ヵヶァ-ヴｦ-ｯｱ-ﾝﾞﾟぁ-ん]){1,2}(?:\s*\1\s*){3,}/g,
                        to: '$1'
                    },
                    {
                        // 日付を削除
                        by: /(?:[\d０-９]{2,4}\s*[年月日時分秒\/.-]){1,6}(?:\s*[.．]\s*[\d０-９]|)/g,
                        to: ' '
                    },
                    {
                        // 記号を削除
                        by: /(?:\s+|^)[^一-龠々〆ァ-ヴｦ-ｯｱ-ﾝﾞﾟぁ-んﾞ゛ﾟ゜\s\wａ-ｚＡ-Ｚ０-９Α-ωⅠ-Ⅹⅰ-ⅹ,，.．､、｡。!！?？\u301Cー～－ｰ-](?=(?:\s|$))/gi,
                        to: ' '
                    },
                    {
                        // ゴミを削除
                        by: /\b(?:[\s\u3000]*[ox▼▲▽△]{1,2}[\s\u3000]*)\b/gi,
                        to: ' '
                    }
                ];
                s = Pot.StringUtil.stringify(desc.value);
                if (s) {
                    s = Pot.StringUtil.trim(
                          Pot.StringUtil.wrapBySpace(Pot.StringUtil.spacerize(
                          Pot.StringUtil.normalizeSpace(Pot.StringUtil.removeNoise(
                          Pot.StringUtil.removeAA(Pot.StringUtil.remove2chName(
                          Pot.unescapeHTML(Pot.StringUtil.stripTags(s))))))))
                    );
                }
                patterns.forEach(function(re) {
                    s = s.replace(re.by, re.to).replace(re.by, re.to);
                });
                desc.value = Pot.StringUtil.trim(Pot.StringUtil.wrapBySpace(Pot.StringUtil.spacerize(s)));
            }
        }]
    },
    {
        name: 'テキスト変換',
        children: [
        {
            name: '1文字ずつ逆順にする',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stringify(desc.value).split('').reverse().join('');
            }
        },
        {
            name: 'ホワイトスペース区切りで逆順にする',
            execute: function(elmText, desc) {
                var value, values, re;
                re = /([\s\u00A0\u3000]*)([^\s\u00A0\u3000]*)/g;
                value = Pot.StringUtil.stringify(desc.value);
                if (re.test(value)) {
                    values = [];
                    value.replace(re, function(all, space, text) {
                        if (space && space.length) {
                            values.unshift(space);
                        }
                        if (text && text.length) {
                            values.unshift(text);
                        }
                        return '';
                    });
                    value = values.join('');
                }
                desc.value = value;
            }
        },
        {
            name: '----'
        },
        {
            name: '英大文字に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stringify(desc.value).toUpperCase();
            }
        },
        {
            name: '英小文字に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stringify(desc.value).toLowerCase();
            }
        },
        {
            name: '----'
        },
        {
            name: '全角文字に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.toZenSpaceCase(
                    Pot.StringUtil.toZenkanaCase(Pot.StringUtil.toZenkakuCase(desc.value)));
            }
        },
        {
            name: '半角文字に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.toHanSpaceCase(
                    Pot.StringUtil.toHankanaCase(Pot.StringUtil.toHankakuCase(desc.value)));
            }
        },
        {
            name: '----'
        },
        {
            name: 'ひらがなに変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.toHiraganaCase(desc.value);
            }
        },
        {
            name: 'カタカナに変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.toKatakanaCase(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: '全角スペースに変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.toZenSpaceCase(desc.value);
            }
        },
        {
            name: '半角スペースに変換',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.toHanSpaceCase(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: 'すべてひらがなに変換',
            execute: function(elmText, desc) {
                var d, value;
                d = new Deferred();
                value = Pot.StringUtil.toHankakuCase(Pot.StringUtil.toZenkanaCase(
                    Pot.StringUtil.toHiraganaCase(Pot.StringUtil.stringify(desc.value))));
                if (value && value.length) {
                    callLater(0.125, function() {
                        Yahoo.Pot.getKanaReadings(value).addCallback(function(res) {
                            d.callback();
                            desc.value = Pot.StringUtil.toHirayomiCase(res.join(''));
                        }).callback();
                    });
                } else {
                    d.callback();
                }
                return d;
            }
        },
        {
            name: 'すべてローマ字に変換',
            execute: function(elmText, desc) {
                var d, value;
                d = new Deferred();
                value = Pot.StringUtil.toHankakuCase(Pot.StringUtil.toZenkanaCase(
                    Pot.StringUtil.toHiraganaCase(Pot.StringUtil.toHanSpaceCase(
                        Pot.StringUtil.stringify(desc.value)))));
                if (value && value.length) {
                    callLater(0.125, function() {
                        Yahoo.Pot.getRomaReadings(value).addCallback(function(res) {
                            d.callback();
                            desc.value = Pot.StringUtil.stringify(res.join(''));
                        }).callback();
                    });
                } else {
                    d.callback();
                }
                return d;
            }
        },
        {
            name: '----'
        },
        {
            name: 'HTMLエスケープ',
            execute: function(elmText, desc) {
                desc.value = Pot.escapeHTML(desc.value);
            }
        },
        {
            name: 'HTMLアンエスケープ',
            execute: function(elmText, desc) {
                desc.value = Pot.unescapeHTML(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: 'JSON文字列エスケープ',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.escapeSequence(desc.value);
            }
        },
        {
            name: 'JSON文字列アンエスケープ',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.unescapeSequence(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: 'URLエンコード',
            execute: function(elmText, desc) {
                desc.value = encodeURIComponent(desc.value);
            }
        },
        {
            name: 'URLデコード',
            execute: function(elmText, desc) {
                desc.value = decodeURIComponent(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: 'Base64エンコード',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.base64.encode(desc.value);
            }
        },
        {
            name: 'Base64デコード',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.base64.decode(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: 'MD5',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stringify(desc.value).md5();
            }
        },
        {
            name: 'SHA1',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stringify(desc.value).sha1();
            }
        },
        {
            name: 'CRC32',
            execute: function(elmText, desc) {
                desc.value = Pot.sprintf('%08x', Pot.StringUtil.crc32(desc.value));
            }
        },
        {
            name: '----'
        },
        {
            name: 'AlphamericStringエンコード',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.AlphamericString.encode(desc.value)
            }
        },
        {
            name: 'AlphamericStringデコード',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.AlphamericString.decode(desc.value);
            }
        },
        {
            name: '----'
        },
        {
            name: '2進数に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.sprintf('%b', Pot.StringUtil.stringify(desc.value));
            }
        },
        {
            name: '8進数に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.sprintf('%o', Pot.StringUtil.stringify(desc.value));
            }
        },
        {
            name: '16進数に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.sprintf('%x', Pot.StringUtil.stringify(desc.value));
            }
        },
        {
            name: '36進数に変換',
            execute: function(elmText, desc) {
                desc.value = Pot.sprintf('%a', Pot.StringUtil.stringify(desc.value));
            }
        }]
    },
    {
        name: 'テキスト補助',
        children: [
        {
            name: '<blockquote>で囲う',
            execute: function(elmText, desc) {
                desc.value = ['<blockquote>\n', '\n</blockquote>'].join(Pot.StringUtil.trim(desc.value));
            }
        },
        {
            name: '<p>で囲う',
            execute: function(elmText, desc) {
                desc.value = ['<p>\n', '\n</p>'].join(Pot.StringUtil.trim(desc.value));
            }
        },
        {
            name: '<div>で囲う',
            execute: function(elmText, desc) {
                desc.value = ['<div>\n', '\n</div>'].join(Pot.StringUtil.trim(desc.value));
            }
        },
        {
            name: '----'
        },
        {
            name: '行末に<br />を挿入',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stringify(desc.value).replace(/(\r\n|\r|\n)/g, '<br />$1');
            }
        },
        {
            name: '各行を<div>で囲う',
            execute: function(elmText, desc) {
                desc.value = Pot.StringUtil.stringify(desc.value).replace(/^(.*)$/gm, '<div>$1</div>');
            }
        }]
    }
);

// メニューの初期化
callLater(0, function() { Pot.QuickPostForm.switchTextItemHelper.call(); });


})();
//-----------------------------------------------------------------------------
// Shortcutkey
//-----------------------------------------------------------------------------
(function() {

forEach({
    // Based: 'shortcutkey.quickPost.link' (40_ui.js)
    'shortcutkey.quickPost.bookmark': function(e) {
        var win, doc, ctx, exts;
        cancel(e);
        win = getMostRecentWindow().content;
        doc = win.document;
        ctx = update({
            document: doc,
            window: win,
            title: doc.title,
            selection: '' + win.getSelection(),
            target: doc.documentElement
        }, win.location);
        exts = Tombloo.Service.check(ctx).filter(function(ext) {
            // Bookmark を追加
            return /^Bookmark/.test(ext.name);
        });
        Tombloo.Service.extractors.extract(ctx, exts[0]).addCallback(function(ps) {
            QuickPostForm.show(ps);
        });
    }
}, function([key, func]) {
    key = getPref(key);
    if (key) {
        shortcutkeys[key] = {
            execute: func
        };
    }
});


})();
//-----------------------------------------------------------------------------
// Audio - Audio対応
//-----------------------------------------------------------------------------
(function() {

// from: Taberareloo::extractors.js
if (!Tombloo.Service.extractors['Audio']) {
    Tombloo.Service.extractors.register([
    {
        name: 'Audio',
        ICON: 'chrome://tombloo/skin/audio.png',
        check: function(ctx) {
            var re = /(?:mp3|ogg|wav|midi?)$/i;
            return ctx.onAudio ||
                (tagName(ctx.target) === 'audio' && re.test(Pot.getExt(ctx.target.src)));
        },
        extract: function(ctx) {
            var src, ext, title, text, re, result;
            re = /([^\/\\]*?)\.[^.]*$/;
            src = Pot.resolveRelativeURI(ctx.target.src, ctx.target);
            if (ctx.target.tagName && tagName(ctx.target) !== 'audio') {
                text = Pot.StringUtil.spacerize(ctx.target.textContent);
            }
            title = Pot.sprintf('%s - %s%s',
                ctx.title || ctx.host,
                re.test(src) && src.match(re)[1] || src.split(/[\/\\]/).filter(function(s) {
                    return s && s.length;
                }).pop(),
                text ? Pot.sprintf(' - %s', text) : ''
            );
            ext = Pot.getExt(src).toLowerCase();
            result = {
                type      : 'audio',
                item      : title,
                itemUrl   : src,
                extension : ext
            };
            if (ctx.file) {
                result.file = ctx.file;
            }
            return result;
        }
    },
    {
        name: 'Audio - audio link',
        ICON: 'chrome://tombloo/skin/audio.png',
        check: function(ctx) {
            var re = /(?:mp3|ogg|wav|midi?)$/i;
            return ctx.onLink && ctx.link &&
                (ctx.onAudio || re.test(Pot.getExt(ctx.link.href)));
        },
        extract: function(ctx) {
            ctx.target = update(ctx.target || {}, {
                src: ctx.link.href
            });
            return Tombloo.Service.extractors['Audio'].extract(ctx);
        }
    },
    {
        name: 'Audio - Upload from Cache',
        ICON: 'chrome://tombloo/skin/audio.png',
        check: function(ctx) {
            return Tombloo.Service.extractors['Audio'].check(ctx) ||
                Tombloo.Service.extractors['Audio - audio link'].check(ctx);
        },
        extract: function(ctx) {
            var target, itemUrl;
            target = ctx.target;
            itemUrl = target.src || target.href || (ctx.link && ctx.link.href);
            return download(itemUrl, getTempDir()).addCallback(function(file) {
                return Tombloo.Service.extractors['Audio'].extract(update(ctx, {
                    file: file,
                    target: update(ctx.target || {}, {
                        src: itemUrl
                    })
                }));
            });
        }
    }], 'Quote');
}

// Tumblr
if (!Tumblr.Audio) {
    update(Tumblr, {
        Audio: {
            convertToForm: function(ps) {
                var res = {
                    'post[type]': ps.type,
                    'post[two]': joinText([(ps.item ? ps.item.link(ps.pageUrl) : ''), ps.description], '\n\n')
                };
                if (ps.itemUrl) {
                    res['post[three]'] = ps.itemUrl;
                }
                return res;
            }
        }
    });
    // リブログを可能にする
    addAround(Tombloo.Service.extractors['ReBlog'], 'convertToParams', function(proceed, args) {
        var form, result;
        result = proceed(args);
        if (!result && args && args[0]) {
            form = args[0];
            switch (form['post[type]']) {
                case 'audio':
                    result = {
                        // please-dont-download-this-or-our-lawyers-wont-let-us-host-audio
                        // とのことなので Audioは DL しない
                        body    : form['post[two]'],
                        itemUrl : ''
                    };
                    break;
                default:
                    break;
            }
        }
        return result;
    });
    // チェックにAudioを追加 (Tumblrはmp3のみ)
    update(Tumblr, {
        /**
         * ポスト可能かをチェックする。
         *
         * @param  {Object}   ps
         * @return {Boolean}
         */
        check: function(ps) {
            return /(?:regular|photo|quote|link|conversation|video|bookmark)/.test(ps.type) ||
                (ps.type === 'audio' && ps.extension === 'mp3');
        }
    });
}
if (!Local.Audio) {
    update(Local, {
        check: function(ps) {
            return /(?:regular|photo|quote|link|audio|bookmark)/.test(ps.type);
        },
        post: function(ps) {
            var result;
            switch (ps.type) {
                case 'photo':
                    result = this.Photo.post(ps);
                    break;
                case 'audio':
                    result = this.Audio.post(ps);
                    break;
                default:
                    result = Local.append(getDataDir(ps.type + '.txt'), ps);
                    break;
            }
            return result;
        },
        append: function(file, ps) {
            putContents(file,
                joinText([
                        joinText(
                            [
                                joinText(ps.tags, ' '),
                                ps.item,
                                ps.itemUrl,
                                ps.body,
                                ps.description
                            ],
                            '\n\n',
                            true
                        ),
                        getContents(file)
                    ],
                    '\n\n\n'
                )
            );
            return succeed();
        },
        /**
         * ホスト名をフォルダ名として分けて保存する
         *
         * @param  {Object}  ps
         * @param  {Object}  file
         */
        separateFolders: function(ps, file) {
            let host, re;
            if (ps && (ps.itemUrl || ps.file) &&
                file && Pot.getPref(POT_SEPARATE_USER_DATA_FOLDERS)
            ) {
                host = String(createURI(ps.pageUrl || ps.itemUrl).host);
                if (!host) {
                    try {
                        re = /^\w*:[\/\\]*([^\/\\]+)/gi;
                        host = String(ps.pageUrl || ps.itemUrl).match(re)[1];
                    } catch (e) {}
                    host = String(host || host.name);
                }
                host = Pot.StringUtil.trim(Pot.escapeFileName(host));
                if (host) {
                    file.append(host);
                    createDir(file);
                }
            }
        },
        Photo: {
            post: function(ps) {
                var file, uri, fileName;
                if (!/photo|audio/.test(ps.type)) {
                    throw new Error('Illegal post type: ' + ps.type);
                }
                // 対象のURIがないとき無駄にディレクトリが作られるのを防ぐ
                if (!ps || (!ps.itemUrl && !ps.file)) {
                    return succeed();
                } else {
                    file = getDataDir(ps.type);
                    createDir(file);
                    Local.separateFolders(ps, file);
                    if (ps.file) {
                        file.append(ps.file.leafName);
                    } else {
                        uri = createURI(ps.itemUrl);
                        fileName = validateFileName(uri.fileName);
                        file.append(fileName);
                    }
                    clearCollision(file);
                    return succeed().addCallback(function() {
                        if (ps.file) {
                            ps.file.copyTo(file.parent, file.leafName);
                            return file;
                        } else {
                            return download(ps.itemUrl, file);
                        }
                    }).addCallback(function(file) {
                        var script, process;
                        if (Pot.os.mac) {
                            // Macはコメントをつける
                            script = getTempDir('setcomment.scpt');
                            putContents(script, Pot.sprintf([
                                    'set aFile to POSIX file ("%s" as Unicode text)',
                                    'set cmtStr to ("%s" as Unicode text)',
                                    'tell application "Finder" to set comment of (file aFile) to cmtStr'
                                ].join('\n'),
                                Pot.escapeAppleScriptString(file.path),
                                Pot.escapeAppleScriptString(ps.pageUrl)
                            ), 'UTF-16');
                            process = new Process(new LocalFile('/usr/bin/osascript'));
                            process.run(false, [script.path], 1);
                        }
                    });
                }
            }
        }
    });
    update(Local, {
        Audio: update({}, Local.Photo)
    });
}



})();
//-----------------------------------------------------------------------------
// Install - インストール
//-----------------------------------------------------------------------------
(function() {

// Constants for Setup
const PSU_INSTALL_TITLE     = 'Tombloo - Bookmarkパッチのインストール';
const PSU_UNINSTALL_TITLE   = 'Tombloo - Bookmarkパッチのアンインストール';
const PSU_UPDATECHECK_TITLE = 'Tombloo - Bookmarkパッチのアップデート確認';
const PSU_UPDATE_TITLE      = 'Tombloo - Bookmarkパッチのアップデート';
const PSU_BACKUP_SUFFIX     = '-bookmark.pot.assort.bk';
const PSU_BMA_SCRIPT_NAME   = 'tombloo.poster.bookmark.pot.assort.js';
const PSU_QPF_SCRIPT_NAME   = 'tombloo.poster.bookmark.pot.assort.quickpostform.js';
const PSU_QPF_XUL_FILE      = 'quickPostForm.xul';
const PSU_PREFS_XUL_FILE    = 'prefs.xul';
const PSU_COMP_XML_FILE     = 'completion.xml';
const PSU_DTD_JA_FILE       = 'ja-JP/tombloo.dtd';
const PSU_DTD_EN_FILE       = 'en-US/tombloo.dtd';
const PSU_BMA_SCRIPT_URL    = 'https://github.com/polygonplanet/tombloo/raw/master/' + PSU_BMA_SCRIPT_NAME;
const PSU_QPF_SCRIPT_URL    = 'https://github.com/polygonplanet/tombloo/raw/master/bookmark/' + PSU_QPF_SCRIPT_NAME;


Pot.SetupUtil = {};
Pot.extend(Pot.SetupUtil, {
    progress: {},
    progressLog: function() {
        let msg = '', args = Pot.ArrayUtil.toArray(arguments);
        if (Pot.SetupUtil.progress && Pot.SetupUtil.progress.update) {
            // 途中でキャンセルは未実装
            //if (Pot.SetupUtil.progress.canceled) {
            //    throw 'canceled';
            //}
            if (args && args.length >= 2) {
                msg = Pot.sprintf.apply(null, args);
            } else {
                msg = Pot.StringUtil.stringify(args.shift());
            }
            Pot.SetupUtil.progress.update(msg);
        }
    },
    getConstantURI: function(fileName) {
        let uri;
        switch (fileName) {
            case PSU_QPF_SCRIPT_NAME:
            case PSU_QPF_XUL_FILE:
            case PSU_COMP_XML_FILE:
            case PSU_PREFS_XUL_FILE:
                uri = 'tombloo://chrome/content/' + fileName;
                break;
            case PSU_DTD_JA_FILE:
            case PSU_DTD_EN_FILE:
                uri = 'tombloo://chrome/locale/' + fileName;
                break;
            default:
                uri = fileName;
                break;
        }
        return uri;
    },
    /**
     * インストール
     */
    install: function() {
        let d;
        d = new Deferred();
        d.addCallback(function() {
            Pot.SetupUtil.progress = new Pot.ProgressDialog();
            Pot.SetupUtil.progress.open(PSU_INSTALL_TITLE, 'Installing...');
            return wait(2);
        }).addCallback(function() {
            // QuickPostFormパッチをダウンロード
            let code, file, path, dd;
            Pot.SetupUtil.progressLog('%s Downloading...', PSU_QPF_SCRIPT_NAME);
            path = Pot.SetupUtil.getConstantURI(PSU_QPF_SCRIPT_NAME);
            file = Pot.SetupUtil.assignLocalFile(path);
            dd = Pot.SetupUtil.downloadScript(PSU_QPF_SCRIPT_URL, file.parent).addCallback(function(code) {
                if (!code) {
                    throw new Error('Failed to download: ' + PSU_QPF_SCRIPT_NAME);
                }
                Pot.SetupUtil.progressLog('%s Completed.', PSU_QPF_SCRIPT_NAME);
                return wait(1);
            }).addErrback(function(err) {
                try {
                    dd.cancel(err);
                } catch (er) {}
                Pot.SetupUtil.raiseError('Failed to request: ' + PSU_QPF_SCRIPT_NAME + '\n' + err);
            });
            return dd;
        }).addCallback(function() {
            // quickPostForm.xul を置換
            let success, path;
            path = Pot.SetupUtil.getConstantURI(PSU_QPF_XUL_FILE);
            Pot.SetupUtil.backup(path);
            Pot.SetupUtil.progressLog('%s Backuped.', PSU_QPF_XUL_FILE);
            success = Pot.SetupUtil.findReplace(path, [{
                from: /(<script\b.*?\bsrc\s*=\s*["']?)(quickPostForm.js)(['"]?\s*\/>)(\r\n|\r|\n|)/i,
                to: '$1$2$3$4$1' + PSU_QPF_SCRIPT_NAME + '$3$4'
            }]);
            if (!success) {
                Pot.SetupUtil.raiseError('Failed to replace code: ' + PSU_QPF_XUL_FILE);
            }
            Pot.SetupUtil.progressLog('%s Replaced.', PSU_QPF_XUL_FILE);
            return wait(1);
        }).addCallback(function() {
            // prefs.xul を置換
            let success, path;
            path = Pot.SetupUtil.getConstantURI(PSU_PREFS_XUL_FILE);
            Pot.SetupUtil.backup(path);
            Pot.SetupUtil.progressLog('%s Backuped.', PSU_PREFS_XUL_FILE);
            success = Pot.SetupUtil.findReplace(path, [
            {
                // windowを広くする
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<prefwindow\b[^>]*)(\/?>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2 style="width: auto; height: auto;"$3$4
                ]]></>)
            },
            {
                // 「Bookmarkクイックポスト」などを追加
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(</preferences>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.sprintf(Pot.StringUtil.mtrim(<><![CDATA[
                    $1<preference 
                        $1id="%s" 
                        $1name="extensions.tombloo.%s" 
                        $1type="string" />
                    $1<preference 
                        $1id="%s" 
                        $1name="extensions.tombloo.%s" 
                        $1type="string" />
                    $1<preference 
                        $1id="%s" 
                        $1name="extensions.tombloo.%s" 
                        $1type="bool" />
                    $1<preference 
                        $1id="%s" 
                        $1name="extensions.tombloo.%s" 
                        $1type="bool"/>
                    $1$2$3
                ]]></>),
                    POT_PREF_KEY_PREFIX + POT_SHORTCUTKEY_BOOKMARK,
                    POT_PREF_KEY_PREFIX + POT_SHORTCUTKEY_BOOKMARK,
                    POT_PREF_KEY_PREFIX + POT_AUTO_APPEND_TAGS,
                    POT_PREF_KEY_PREFIX + POT_AUTO_APPEND_TAGS,
                    POT_PREF_KEY_PREFIX + POT_BOOKMARK_PRIVATE,
                    POT_PREF_KEY_PREFIX + POT_BOOKMARK_PRIVATE,
                    POT_PREF_KEY_PREFIX + POT_SEPARATE_USER_DATA_FOLDERS,
                    POT_PREF_KEY_PREFIX + POT_SEPARATE_USER_DATA_FOLDERS
                )
            },
            {
                // windowのsubmitボタンの幅を調整
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<tabpanels\b (?:flex = ["']\d+['"]|) )(>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2 style="margin-bottom: 1em;"$3$4
                ]]></>)
            },
            {
                // Posters Treeの幅を調整
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<tree\b id = ["']posters['"][^>]*)(>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2 style="width: 55em;"$3$4
                ]]></>)
            },
            {
                // Treeに「Audio」と「Bookmark」を追加
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(</treecols>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1<treecol cycler="true"><hbox><label value="Audio"/></hbox></treecol>
                    $1<treecol cycler="true"><hbox><label value="Bookmark"/></hbox></treecol>
                    $1$2$3
                ]]></>)
            },
            {
                // セパレータのマージンを調整
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<separator\b 
                        class = ["']groove-thin['"] width = ["']1['"] 
                        style = ["']margin : 0?\.6em 0 1\.5em 0;?['"] />)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1<separator class="groove-thin" width="1" style="margin: 0.1em 0 0.1em 0;" />$3
                ]]></>)
            },
            {
                // セパレータのマージンを調整(下側)
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<separator\b 
                        class = ["']groove-thin['"] width = ["']1['"] 
                        style = ["']margin : 0?\.6em 0 1\.5em 0;?['"] />)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1<separator class="groove-thin" width="1" style="margin: 0.1em 0 0.1em 0;" />$3
                ]]></>)
            },
            {
                // 「Bookmarkクイックポスト」の入力欄を追加
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<row\b[^>]*>
                        <label\b value = ["'] &label\.shortcutkey\.quickPost\.link;['"][^>]*>
                        <hbox>
                            <textbox\b preference = ["']shortcutkey\.quickPost\.link['"][^>]*>
                        </hbox>
                    </row>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.sprintf(Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2$3
                    $1<row align="center">
                        $1<label value="&label.%s;" />
                        $1<hbox>
                            $1<textbox preference="%s" size="35"/>
                        $1</hbox>
                    $1</row>$3
                ]]></>),
                    POT_SHORTCUTKEY_BOOKMARK,
                    POT_PREF_KEY_PREFIX + POT_SHORTCUTKEY_BOOKMARK
                )
            },
            {
                // 「自動挿入するタグ」「タグを非公開にする」項目を追加
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<row\b[^>]*>
                        <label\b value = ["']&label\.tagAutoComplete;['"][^>]*>
                        <checkbox\b preference = ["']tagAutoComplete['"][^>]*>
                    </row>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.sprintf(Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2$3
                    $1<row align="center" style="margin: 0.7em 0 0.5em 0;">
                        $1<label value="&label.%s;" />
                        $1<textbox preference="%s" />
                    $1</row>
                    $1<row align="center" style="margin: 0.7em 0 0.5em 0;">
                        $1<label value="&label.%s;" />
                        $1<checkbox preference="%s" />
                    $1</row>$3
                ]]></>),
                    POT_AUTO_APPEND_TAGS,
                    POT_PREF_KEY_PREFIX + POT_AUTO_APPEND_TAGS,
                    POT_BOOKMARK_PRIVATE,
                    POT_PREF_KEY_PREFIX + POT_BOOKMARK_PRIVATE
                )
            },
            {
                // 「メディアファイル(Photo/Audio等)をフォルダ分けして保存」を追加
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(<textbox\b 
                        readonly = ["']true['"] value = ["']&label.example; {ProfD}/tombloo['"] />
                    </row>)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.sprintf(Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2$3
                    $1<row align="center">
                        $1<label value="&label.%s;"/>
                        $1<checkbox preference="%s" />
                    $1</row>$3
                ]]></>),
                    POT_SEPARATE_USER_DATA_FOLDERS,
                    POT_PREF_KEY_PREFIX + POT_SEPARATE_USER_DATA_FOLDERS
                )
            },
            {
                // ブックマークに対する処理を定義
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(keyStringField
                        [(] ["']shortcutkey\.quickPost\.regular['"] , true [)] ;?)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.sprintf(Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2$3
                    $1keyStringField('%s', true);$3
                ]]></>),
                    POT_PREF_KEY_PREFIX + POT_SHORTCUTKEY_BOOKMARK
                )
            },
            {
                // TYPESにAudioとBookmarkを追加
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(TYPES : 
                        ["']regular photo quote link video conversation favorite)(['"] 
                            \. split [(] ["'] ['"] [)] ,[\u0009\u0020]*)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2 audio bookmark$3$4
                ]]></>)
            }
            ]);
            if (!success) {
                Pot.SetupUtil.raiseError('Failed to replace source: ' + PSU_PREFS_XUL_FILE);
            }
            Pot.SetupUtil.progressLog('%s Replaced.', PSU_PREFS_XUL_FILE);
            return wait(1);
        }).addCallback(function() {
            // completion.xml を置換
            let success, path;
            path = Pot.SetupUtil.getConstantURI(PSU_COMP_XML_FILE);
            Pot.SetupUtil.backup(path);
            Pot.SetupUtil.progressLog('%s Backuped.', PSU_COMP_XML_FILE);
            success = Pot.SetupUtil.findReplace(path, [
            {
                // 左右(←→)キーでタグ入力補完ウィンドウを閉じられるようにする
                from: Pot.SetupUtil.createPattern(<><![CDATA[
                    ([\u0009\u0020]*)(case KeyEvent \. DOM_VK_ESCAPE : 
                        (?:// FIXME 入力途中の候補をクリア)?
                        this \. popup \. hidePopup [(] [)] ;?
                        return[\u0009\u0020]*;?[\u0009\u0020]*)(\r\n|\r|\n|)
                ]]></>),
                to: Pot.StringUtil.mtrim(<><![CDATA[
                    $1$2$3
                    $1case KeyEvent.DOM_VK_LEFT:
                    $1case KeyEvent.DOM_VK_RIGHT:
                        $1this.popup.hidePopup();
                        $1return;$3
                ]]></>)
            }
            ]);
            if (!success) {
                Pot.SetupUtil.raiseError('Failed to replace source: ' + PSU_COMP_XML_FILE);
            }
            Pot.SetupUtil.progressLog('%s Replaced.', PSU_COMP_XML_FILE);
            return wait(1);
        }).addCallback(function() {
            // locale/ja-JP/tombloo.dtd に項目を追加
            let success, path;
            path = Pot.SetupUtil.getConstantURI(PSU_DTD_JA_FILE);
            Pot.SetupUtil.backup(path);
            Pot.SetupUtil.progressLog('%s Backuped.', PSU_DTD_JA_FILE);
            success = Pot.SetupUtil.appendContents(
                path,
                Pot.StringUtil.mtrim(<><![CDATA[
                    <!ENTITY label.autoAppendTags "自動挿入するタグ(スペース区切り)">
                    <!ENTITY label.bookmarkPrivate "非公開でブックマークする(対応してる場合)">
                    <!ENTITY label.shortcutkey.quickPost.bookmark "ショートカット - Bookmarkクイックポスト">
                    <!ENTITY label.separateUserDataFolders "メディア(Photo等)をフォルダ分けして保存">
                ]]></>).wrap('\n')
            );
            if (!success) {
                Pot.SetupUtil.raiseError('Failed to append entity: ' + PSU_DTD_JA_FILE);
            }
            Pot.SetupUtil.progressLog('%s Appended.', PSU_DTD_JA_FILE);
            
            // locale/en-US/tombloo.dtd に項目を追加
            path = Pot.SetupUtil.getConstantURI(PSU_DTD_EN_FILE);
            Pot.SetupUtil.backup(path);
            Pot.SetupUtil.progressLog('%s Backuped.', PSU_DTD_EN_FILE);
            success = Pot.SetupUtil.appendContents(
                path,
                Pot.StringUtil.mtrim(<><![CDATA[
                    <!ENTITY label.autoAppendTags "Append tags automatically (Splits on whitespace)">
                    <!ENTITY label.bookmarkPrivate "Bookmark private if supported on the service.">
                    <!ENTITY label.shortcutkey.quickPost.bookmark "Shortcutkey - Bookmark Quick Post">
                    <!ENTITY label.separateUserDataFolders "Save media(photo etc.) as separate folders">
                ]]></>).wrap('\n')
            );
            if (!success) {
                Pot.SetupUtil.raiseError('Failed to append entity: ' + PSU_DTD_EN_FILE);
            }
            Pot.SetupUtil.progressLog('%s Appended.', PSU_DTD_EN_FILE);
            return wait(1);
        }).addCallback(function() {
            // ブックマークのショートカットキーを設定
            if (Pot.getPref(POT_SHORTCUTKEY_BOOKMARK) === undefined) {
                // 'CTRL + D' をBookmarkショートカットに設定
                Pot.setPref(POT_SHORTCUTKEY_BOOKMARK, Pot.sprintf('%s + D', KEY_ACCEL));
            }
            Pot.SetupUtil.progressLog('Installation completion.');
            return wait(2);
        }).addCallback(function() {
            Pot.SetupUtil.progress.close();
            callLater(0, function() {
                Pot.SetupUtil.openAlert(PSU_INSTALL_TITLE, [
                        'インストール完了しました。',
                        'ブラウザを再起動するとパッチが適応されます。'
                    ].join('\n'),
                    'そうですか'
                );
            });
        }).addErrback(function(err) {
            try {
                try {
                    d.cancel(err);
                } catch (er) {}
                Pot.SetupUtil.progressLog(
                    'エラーが起きてしまいました…ごめんなさい…\n\n%s',
                    err && err.message || err
                );
                callLater(30, function() {
                    try {
                        Pot.SetupUtil.progress.close();
                    } catch (e) {}
                    Pot.SetupUtil.progress = {};
                });
            } catch (e) {}
        });
        d.callback();
        return d;
    },
    /**
     * アンインストール
     */
    uninstall: function(silentMode) {
        let d;
        d = new Deferred();
        d.addCallback(function() {
            Pot.SetupUtil.progress = new Pot.ProgressDialog();
            Pot.SetupUtil.progress.open(PSU_UNINSTALL_TITLE, 'Uninstalling...');
            return wait(2);
        }).addCallback(function() {
            // QuickPostFormパッチを削除
            let path;
            path = Pot.SetupUtil.getConstantURI(PSU_QPF_SCRIPT_NAME);
            if (!Pot.SetupUtil.removeFile(path)) {
                throw new Error('Failed to remove the file: ' + PSU_QPF_SCRIPT_NAME);
            }
            Pot.SetupUtil.progressLog('%s Removed.', PSU_QPF_SCRIPT_NAME);
            return wait(1);
        }).addCallback(function() {
            // quickPostForm.xul をバックアップから元に戻す
            let path;
            path = Pot.SetupUtil.getConstantURI(PSU_QPF_XUL_FILE);
            Pot.SetupUtil.restoreBackup(path);
            Pot.SetupUtil.progressLog('%s Restored.', PSU_QPF_XUL_FILE);
            return wait(1);
        }).addCallback(function() {
            // prefs.xul をバックアップから元に戻す
            let path;
            path = Pot.SetupUtil.getConstantURI(PSU_PREFS_XUL_FILE);
            Pot.SetupUtil.restoreBackup(path);
            Pot.SetupUtil.progressLog('%s Restored.', PSU_PREFS_XUL_FILE);
            return wait(1);
        }).addCallback(function() {
            // completion.xml をバックアップから元に戻す
            let path;
            path = Pot.SetupUtil.getConstantURI(PSU_COMP_XML_FILE);
            Pot.SetupUtil.restoreBackup(path);
            Pot.SetupUtil.progressLog('%s Restored.', PSU_COMP_XML_FILE);
            return wait(1);
        }).addCallback(function() {
            // locale/ja-JP/tombloo.dtd をバックアップから元に戻す
            let path;
            path = Pot.SetupUtil.getConstantURI(PSU_DTD_JA_FILE);
            Pot.SetupUtil.restoreBackup(path);
            Pot.SetupUtil.progressLog('%s Restored.', PSU_DTD_JA_FILE);
            
            // locale/en-US/tombloo.dtd をバックアップから元に戻す
            path = Pot.SetupUtil.getConstantURI(PSU_DTD_EN_FILE);
            Pot.SetupUtil.restoreBackup(path);
            Pot.SetupUtil.progressLog('%s Restored.', PSU_DTD_EN_FILE);
            return wait(1);
        }).addCallback(function() {
            Pot.SetupUtil.progressLog('Uninstallation completion.');
            return wait(2);
        }).addCallback(function() {
            Pot.SetupUtil.progress.close();
            if (!silentMode) {
                callLater(0, function() {
                    Pot.SetupUtil.openAlert(PSU_UNINSTALL_TITLE, [
                            'アンインストールが完了しました。',
                            'ブラウザを再起動すると適応されます。'
                        ].join('\n'),
                        'そうですか'
                    );
                });
            }
        }).addErrback(function(err) {
            try {
                try {
                    d.cancel(err);
                } catch (er) {}
                Pot.SetupUtil.progressLog(
                    'エラーが起きてしまいました…ごめんなさい…\n\n%s',
                    err && err.message || err
                );
                callLater(30, function() {
                    try {
                        Pot.SetupUtil.progress.close();
                    } catch (e) {}
                    Pot.SetupUtil.progress = {};
                });
            } catch (e) {}
        });
        d.callback();
        return d;
    },
    /**
     * 最新バージョンにアップデートする
     */
    update: function(code) {
        let d;
        try {
            if (!Pot.SetupUtil.validateCode(code)) {
                throw new Error('Failed to update');
            }
            d = new Deferred();
            d.addCallback(function() {
                // 一旦アンインストールする
                return Pot.SetupUtil.uninstall(true).addCallback(function() {
                    return wait(2);
                });
            }).addCallback(function() {
                let dd, path, file;
                path = Pot.sprintf('tombloo.patch://%s', PSU_BMA_SCRIPT_NAME);
                file = Pot.SetupUtil.assignLocalFile(path);
                dd = Pot.SetupUtil.downloadScript(PSU_BMA_SCRIPT_URL, file.parent).addCallback(function(source) {
                    if (!source) {
                        throw new Error('Failed to save patch script');
                    }
                }).addErrback(function(err) {
                    try {
                        dd.cancel(err);
                    } catch (er) {}
                    Pot.SetupUtil.raiseError(err);
                });
                return dd;
            }).addCallback(function() {
                // リロードで自動的にインストールがはじまる
                reload();
            }).addErrback(function(err) {
                try {
                    d.cancel(err);
                } catch (er) {}
                Pot.SetupUtil.raiseError(err);
            });
            d.callback();
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return maybeDeferred(d);
    },
    /**
     * アップデートできるか確認して可能ならアップデートする
     */
    isUpdatable: function() {
        let d, re, version;
        re = {
            version: /[*]\s*@version\s*([\d.abcr-]+)/i
        };
        version = {
            current: Pot.VERSION,
            latest: null
        };
        d = request(PSU_BMA_SCRIPT_URL).addCallback(function(res) {
            let df, code, head, message, params, agree, result;
            code = Pot.StringUtil.stringify(res.responseText).convertToUnicode();
            head = code.slice(0, POT_SCRIPT_DOCCOMMENT_SIZE);
            if (!re.version.test(head)) {
                alert('エラーです');
            } else {
                version.latest = head.match(re.version)[1];
                if (version.latest <= version.current) {
                    Pot.SetupUtil.openAlert(
                        PSU_UPDATECHECK_TITLE,
                        'すでに最新バージョンです',
                        'そうですか'
                    );
                } else {
                    message = [
                        '最新バージョンにアップデートできます。',
                        'アップデートしますか？',
                        '',
                        getMessage('message.install.warning')
                    ].join('\n');
                    agree = 'label.install.agree';
                    
                    params = {};
                    params[message] = null;
                    params[agree]   = false;
                    
                    result = input(params, PSU_UPDATECHECK_TITLE);
                    
                    if (result && result[agree]) {
                        df = Pot.SetupUtil.update(code);
                    }
                }
            }
            return maybeDeferred(df);
        }).addErrback(function(err) {
            try {
                d.cancel(err);
            } catch (e) {}
        });
        return d;
    },
    /**
     * インストールされてなければ実行する
     */
    ensureInstall: function() {
        try {
            if (!Pot.SetupUtil.isInstalled()) {
                callLater(0, function() {
                    Pot.SetupUtil.install();
                });
            }
        } catch (e) {
            throw e;
        }
    },
    /**
     * パッチがインストールされているか調べる
     */
    isInstalled: function() {
        let result = false, exists, paths, path;
        try {
            paths = [
                PSU_QPF_SCRIPT_NAME,
                PSU_QPF_XUL_FILE,
                PSU_COMP_XML_FILE,
                PSU_PREFS_XUL_FILE,
                PSU_DTD_JA_FILE,
                PSU_DTD_EN_FILE
            ];
            exists = true;
            paths.forEach(function(path) {
                let uri = Pot.SetupUtil.getConstantURI(path);
                if (!Pot.SetupUtil.existsFile(uri) ||
                    !Pot.SetupUtil.getFileSize(uri)) {
                    exists = false;
                    throw StopIteration;
                }
            });
            if (exists) {
                result = true;
            }
        } catch (e) {
            if (e != StopIteration || !(e instanceof StopIteration)) {
                throw e;
            }
        }
        return result;
    },
    createPattern: function(s, flags, callback) {
        let cb, f, p;
        if (Pot.isFunction(flags)) {
            [flags, callback] = [callback, flags];
        }
        cb = callback || (function(a) { return a });
        p = s.toString().trim();
        if (flags && flags.indexOf('e') !== -1) {
            flags = flags.split('e').join('');
            p = Pot.escapeRegExp(p);
        }
        return new RegExp(
            cb(p).replace(/[\s\u00A0\u3000]+/g, '\\s*'),
            flags || 'i'
        );
    },
    downloadScript: function(url, path) {
        let d, file;
        try {
            if (!path) {
                throw new Error('Illegal argument file: ' + file);
            }
            file = Pot.SetupUtil.assignLocalFile(path);
            if (!file.isDirectory()) {
                file = file.parent;
            }
            d = request(url).addCallback(function(res) {
                let code;
                try {
                    if (!res) {
                        throw new Error('Failed to download: ' + url);
                    }
                    code = String(res.responseText).convertToUnicode();
                    if (!Pot.SetupUtil.validateCode(code)) {
                        throw new Error('Invalid source code: ' + url);
                    }
                    return download(url, file).addCallback(function(resfile) {
                        return code;
                    });
                } catch (e) {
                    Pot.SetupUtil.raiseError(e);
                }
            }).addErrback(function(err) {
                try {
                    d.cancel(err);
                } catch (e) {}
            });
        } catch (er) {
            Pot.SetupUtil.raiseError(er);
        }
        return maybeDeferred(d);
    },
    findReplace: function(fileName, replacements) {
        var result = false, code, file;
        try {
            file = Pot.SetupUtil.assignLocalFile(fileName);
            code = Pot.SetupUtil.loadFile(file);
            if (!code) {
                throw new Error('findReplace(): code is empty: ' + fileName);
            } else {
                replacements.forEach(function(pairs) {
                    if (!pairs || pairs.from === undefined || pairs.to === undefined) {
                        throw new Error('replacement is undefined');
                    }
                    if (!pairs.from.test(code)) {
                        throw new Error('findReplace: No match: \n' + pairs.from.toString());
                    }
                    code = code.replace(pairs.from, pairs.to);
                });
                Pot.SetupUtil.saveFile(file, code);
                result = true;
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    loadFile: function(fileName) {
        let result = false, file;
        try {
            file = Pot.SetupUtil.assignLocalFile(fileName);
            result = Pot.StringUtil.stringify(getContents(file));
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    saveFile: function(fileName, code) {
        let result = false, file;
        try {
            file = Pot.SetupUtil.assignLocalFile(fileName);
            putContents(file, Pot.StringUtil.stringify(code));
            result = true;
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    appendContents: function(fileName, code) {
        return Pot.SetupUtil.saveFile(fileName,
            Pot.SetupUtil.loadFile(fileName) + Pot.StringUtil.stringify(code)
        );
    },
    toBackupFile: function(path) {
        let result = false, file;
        try {
            file = Pot.SetupUtil.assignLocalFile(path);
            result = Pot.SetupUtil.assignLocalFile(file.path + PSU_BACKUP_SUFFIX);
            if (!file || !result) {
                throw new Error('Cannot create backup file');
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    backup: function(path) {
        let result = false, file, bk;
        try {
            file = Pot.SetupUtil.assignLocalFile(path);
            bk = Pot.SetupUtil.toBackupFile(file.path);
            if (bk.exists() && bk.fileSize > 0) {
                result = true;
            } else {
                if (bk.exists()) {
                    bk.remove();
                }
                file.copyTo(createDir(bk.parent), bk.leafName);
                if (bk.exists() && bk.fileSize > 0) {
                    result = true;
                }
            }
            if (!result) {
                throw new Error('Backup failed: ' + bk.leafName);
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    restoreBackup: function(path) {
        let result = false, file, bk, name;
        try {
            file = Pot.SetupUtil.assignLocalFile(path);
            bk = Pot.SetupUtil.toBackupFile(path);
            if (!file.exists() || !bk.exists()) {
                throw new Error('File is not found on restoreBackup: ' + file.leafName);
            }
            if (!bk.fileSize) {
                throw new Error('File size is 0: ' + bk.leafName);
            }
            name = file.leafName;
            if (!Pot.SetupUtil.removeFile(file)) {
                throw new Error('Cannot restore backup file: ' + name);
            }
            if (!Pot.FileUtil.rename(bk, name)) {
                bk.moveTo(null, name);
            }
            if (bk.leafName === name) {
                result = true;
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    removeFile: function(fileName, recursive) {
        let file, result = false;
        try {
            file = Pot.SetupUtil.assignLocalFile(fileName);
            if (!file.exists()) {
                result = true;
            } else {
                file.permissions = 0666;
                file.remove(!!recursive);
                if (!file.exists()) {
                    result = true;
                }
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    existsFile: function(fileName) {
        let file, result = false;
        try {
            file = Pot.SetupUtil.assignLocalFile(fileName);
            if (file.exists()) {
                result = true;
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    getFileSize: function(fileName) {
        let file, result = false;
        try {
            file = Pot.SetupUtil.assignLocalFile(fileName);
            if (file.exists()) {
                result = file.fileSize - 0;
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return result;
    },
    validateCode: function(code) {
        let ok = false, filters, len, keywords = [
            /Tombloo/i,
            /\b(?:addCallbacks?|Deferred|request|download)\b/i,
            /\b(?:update|addBefore|addAround)\b/,
            'function',
            'return',
            /[(){}]/
        ];
        if (code && code.length > 256 && Pot.isString(code)) {
            len = keywords.length;
            filters = keywords.filter(function(keyword) {
                return Pot.isRegExp(keyword) && keyword.test(code) || code.indexOf(keyword) !== -1;
            });
            if (filters && filters.length === len) {
                ok = true;
            }
        }
        return ok;
    },
    assignLocalFile: function(filePath) {
        let file, path, re, names;
        try {
            re = {
                tombloo: /^Tombloo:\/{0,}/i,
                data: /^(?:Tombloo[.]|)data(?:es|):\/{0,}/i,
                patch: /^(?:Tombloo[.]|)patch(?:es|):\/{0,}/i,
                defs: /^[{]([^{}]+?)[}]:\/{0,}/,
                sep: /[\/\\]/g
            };
            if (filePath instanceof ILocalFile) {
                file = filePath;
            } else {
                path = Pot.StringUtil.stringify(filePath);
                if (!path) {
                    throw new Error('Argument path is empty');
                }
                if (re.tombloo.test(path)) {
                    file = Pot.SetupUtil.getExtensionFile(path.replace(re.tombloo, ''));
                } else if (re.data.test(path) || re.patch.test(path)) {
                    if (re.data.test(path)) {
                        file = getDataDir();
                        names = path.replace(re.data, '').split(re.sep);
                    } else {
                        file = getPatchDir();
                        names = path.replace(re.patch, '').split(re.sep);
                    }
                    if (names && names.length) {
                        names.forEach(function(name) {
                            if (name) {
                                file.append(name);
                            }
                        });
                    }
                } else if (re.defs.test(path)) {
                    path = 'file:///' + path.replace(re.defs, function(all, name) {
                        return DirectoryService.get(name, IFile).path;
                    }).replace(/\\/g, '/');
                    file = getLocalFile(path);
                } else {
                    file = getLocalFile(path);
                }
            }
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return file;
    },
    getExtensionFile: function(path) {
        let file, dir, fileName, sep;
        try {
            sep = '/';
            file = getExtensionDir(EXTENSION_ID);
            dir = Pot.StringUtil.stringify(path).split(/[\/\\]/);
            fileName = dir.pop();
            while (dir && dir[dir.length - 1].length === 0) {
                dir.pop();
            }
            dir = dir.join(sep);
            file.setRelativeDescriptor(file, dir);
            file.append(fileName);
        } catch (e) {
            Pot.SetupUtil.raiseError(e);
        }
        return file;
    },
    raiseError: function(e) {
        try {
            error(e);
            alert(Pot.sprintf('Error!\n%s', e && e.message || e));
        } catch (er) {
            alert(er + '\n' + e);
        }
        throw ((e instanceof Error) ? e : new Error(e));
    },
    openAlert: (function() {
        let xul = Pot.StringUtil.trim(<><![CDATA[
            <?xml version="1.0" encoding="utf-8"?>
            <?xml-stylesheet type="text/css" href="chrome://global/skin/"?>
            <?xml-stylesheet type="text/css" href="chrome://global/skin/global.css"?>
            <?xml-stylesheet type="text/css" href="data:text/css,
            button {
                cursor: pointer;
                margin-top: 0.7em;
                padding: 0.5em 0.7em 0.5em 0.4em;
            }
            .button-icon {
                margin-right: 0.5em;
            }
            "?>
            <dialog title="{TITLE}" buttons="accept"
                    xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
                    xmlns:html="http://www.w3.org/1999/xhtml">
                <hbox flex="1">
                    <vbox style="margin: 0.8em 1.7em;" flex="1">
                        <spacer height="10"/>
                        {MESSAGE}
                        <spacer height="10"/>
                        {EXTRA}
                        <button id="submit-button" dlgtype="accept" label="{BUTTON}" 
                                image="chrome://tombloo/skin/accept.png"/>
                    </vbox>
                </hbox>
            </dialog>
        ]]></>);
        return function(title, message, button, extra) {
            let data, reps;
            reps = {
                '{TITLE}': Pot.escapeHTML(Pot.StringUtil.stringify(title)),
                '{MESSAGE}': Pot.escapeHTML(Pot.StringUtil.stringify(message)).split(/(?:\r\n|\r|\n)/).map(function(s) {
                                return Pot.sprintf('<label value="%s"/>', s);
                             }).join('\n'),
                '{BUTTON}': Pot.escapeHTML(Pot.StringUtil.stringify(button) || 'OK'),
                '{EXTRA}': Pot.StringUtil.stringify(/<\w[^>]*>/.test(extra) ? extra : '')
            };
            data = Pot.StringUtil.stringify(xul);
            forEach(reps, function([key, val]) {
                data = data.replace(key, val);
            });
            openDialog(
                Pot.toDataURI.encodeURI(data, 'xul', 'utf-8'),
                Pot.implode({
                    chrome       : 'yes',
                    alwaysRaised : 'yes',
                    resizable    : 'yes',
                    centerscreen : 'yes',
                    dependent    : 'yes',
                    titlebar     : 'yes',
                    close        : 'yes'
                }, '=', ',')
            );
        };
    })()
});

// インストール確認と実行
callLater(1, function() { Pot.SetupUtil.ensureInstall(); });


})();
//-----------------------------------------------------------------------------
// コンテキストメニューに設定メニューを登録
//-----------------------------------------------------------------------------
(function() {

// メニューのラベルを定義
const POT_BOOKMARK_MENU_LABELS = {
    top: {
        ja: 'Bookmarkパッチの設定',
        en: 'Bookmark patch settings'
    },
    check: {
        ja: '最新のアップデート確認',
        en: 'Confirm the latest update'
    },
    uninstall: {
        ja: 'Bookmarkパッチをアンインストール',
        en: 'Uninstall the Bookmark patch'
    }
};

Pot.tmp.MENULABEL = function(key) {
    return POT_BOOKMARK_MENU_LABELS[key][Pot.lang === 'ja' && Pot.lang || 'en'];
};

Tombloo.Service.actions.register({
    name: Pot.tmp.MENULABEL('top'),
    type: 'context,menu',
    // icon: http://www.famfamfam.com/
    icon: Pot.toDataURI(Pot.StringUtil.trimAll(<>
        iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6QAAABl0RVh0
        U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAKfSURBVDjLfZNLaNRXFIe/O//JTCePxqQi
        Rq2CDcQkGFoQF0VaCS4MAVGoiEhDpEigi0JxXYKhthTaTRcuVOhCIgXBFCtVCLb1laoNKkl8tIyP
        SCoTY8aOJqP538evixiZUOKBw+Uezve7h3PONZKYs81fntPuLfX8MZonOOF9wPtA8AHnAhveeYsD
        vVcZPPCRmWOSlFjwnhCEsy9BN3t6N+vOCe98KUKi9PLqNetxsaex7BIdb36FjT3W+lnB1wkE55ku
        WpZVpbGxp7X8J9bV3mGpbvN2dYap4gzev7YC3/Pn8DiL00maa56yOjVEoraVTZVnWFKR4vK1MYLz
        PQsKnPumrXvk74mey0M51pf/RrJuO4lF79Oc6OfK9VGG/8r13Ort7C5ljCTsxVUZKWpQUBQEX1zs
        6OpqOb1nZcseSKSIH/zIkfPRzzuahvZJCUIQ3hYn6rY/emAkEZ+tG1N543IJJKEgEjUfQPkqZJ8g
        W8BODuGLjxCGYC3xs/vE+ccdRhLF42ZLsPRGTZ9WJpfvRHGOED8h2Dz4IsiBSWKSVQRnKQweJT84
        coI0u8zcIhWOmPrgOZlas60hWrEVxePITaNQRP45mAiXf0ju1DEfP6O75Xvtn9fE6o+VJc26F/f6
        +sLTmyAhzaAwA4oxRIz/eixvZ2ibg/83hZqdmjKZin5byCIDKGAwII9CgIiptd+qf8ExAog32stq
        3sWYJHKOOP8QU1ZLIlVNasnSlcP7zNrS/Hl/YbJvcSaI1mhRE4Ur3zE5MJDFcKGiob6zas1G0nXN
        5O/k2oHhBTbRfWgqV2cmTu5l4veBg87yXuPX2v3v7Wzb3eOH/4mfx7yYpn1+ydIrHzvEJ9n93B35
        nM2lcUlc+ozqM7v44Zdt3CiN/wel+5Gy/cSN+gAAAABJRU5ErkJggg==
    </>), 'image/png', true),
    children: [
        {
            // アップデートの確認
            name: Pot.tmp.MENULABEL('check'),
            type: 'context,menu',
            check: function(ctx) {
                return true;
            },
            execute: function(ctx) {
                Pot.SetupUtil.isUpdatable();
            }
        },
        {
            // アンインストール
            name: Pot.tmp.MENULABEL('uninstall'),
            type: 'context,menu',
            check: function(ctx) {
                return true;
            },
            execute: function(ctx) {
                if (confirm('アンインストールを実行します\nよろしいですか？')) {
                    Pot.SetupUtil.uninstall();
                }
            }
        }
    ]
}, '----');


// 区切り線を登録
Tombloo.Service.actions.register({
    name: '----',
    type: 'context,menu'
}, Pot.tmp.MENULABEL('top'));


delete Pot.tmp.MENULABEL;


})();
//-----------------------------------------------------------------------------
// Update the grobal object with Pot
//-----------------------------------------------------------------------------
(function() {


update(typeof grobal !== 'undefined' && grobal || {}, {
    Pot: Pot
});


})();
//-----------------------------------------------------------------------------
// End.
//-----------------------------------------------------------------------------
})();

