/**
 *
 * Created by lichong on 15/6/26.
 */
module MsgpackZ {
    var _toString = String.fromCharCode;
    var _num2bin: Array<string>, _bin2num: Array<number>;

    export enum MsgpackType {
        Nil,
        Bool,
        Int,
        Float,
        Str,
        Bin,
        Arr,
        Map,
        Ext,
        Int64Hex,
    }
    var MAX_INT = Math.pow(2, 53);
    var MIN_INT = -Math.pow(2, 53);

    function _init() {
        var i: number = 0, v: string;
        _num2bin = [];
        _bin2num = [];
        for (; i < 0x100; ++i) {
            v = _toString(i);
            _num2bin[i] = v;
            _bin2num[v] = i;
        }
        for (i = 0x80; i < 0x100; ++i) {
            _bin2num[_toString(0xf700 + i)] = i;
        }
    }

    // inner - byteArray To ByteString
    function byteArrayToByteString(byteArray: Array<number>): string { // @param ByteArray
                                                // @return String
        // http://d.hatena.ne.jp/uupaa/20101128
        try {
            return _toString.apply(this, byteArray); // toString
        } catch(err) {
            ; // avoid "Maximum call stack size exceeded"
        }
        var rv = [], i = 0, iz = byteArray.length;
        for (; i < iz; ++i) {
            rv[i] = _num2bin[byteArray[i]];
        }
        return rv.join("");
    }
    var _isArray = Array.isArray || (function(mix) {
            return Object.prototype.toString.call(mix) === "[object Array]";
        });

    _init();

    export class Packer {
        private m_buf: Array<number>;
        constructor() {
            this.m_buf = [];
        }

        getStream(): Array<number> {
            return this.m_buf;
        }
        __debugOutput() {
            var len: number = this.m_buf.length;
            var tmp: string = "m_buffer is : [";
            for (var i = 0; i < len; i++) {
                tmp = tmp + this.m_buf[i].toString(16) + ", ";
            }
            tmp += "]";
            console.log(tmp);
        }
        packNil() {
            this.m_buf.push(0xc0);
        }
        packBool(b: Boolean) {
            if (b) {
                this.m_buf.push(0xc2);
            }
            else {
                this.m_buf.push(0xc3);
            }
        }
        packNaN() {
            this.m_buf.push(0xcb, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
        }
        packInfinity() {
            this.m_buf.push(0xcb, 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
        }
        packInt(mix: number) {
            var high: number, low: number;
            if (mix !== mix) {    //isNaN
                this.m_buf.push(0xcb, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
            } else if (mix == Infinity) {
                this.m_buf.push(0xcb, 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
            } else {
                if (mix < 0) {
                    // int
                    if (mix >= -32) { // negative fixnum
                        this.m_buf.push(0xe0 + mix + 32);
                    } else if (mix > -0x80) {
                        this.m_buf.push(0xd0, mix + 0x100);
                    } else if (mix > -0x8000) {
                        mix += 0x10000;
                        this.m_buf.push(0xd1, mix >> 8, mix & 0xff);
                    } else if (mix > -0x80000000) {
                        mix += 0x100000000;
                        this.m_buf.push(0xd2, mix >>> 24, (mix >> 16) & 0xff,
                            (mix >>  8) & 0xff, mix & 0xff);
                    } else {
                        high = Math.floor(mix / 0x100000000);
                        low  = mix & 0xffffffff;
                        this.m_buf.push(0xd3, (high >> 24) & 0xff, (high >> 16) & 0xff,
                            (high >>  8) & 0xff,         high & 0xff,
                            (low  >> 24) & 0xff, (low  >> 16) & 0xff,
                            (low  >>  8) & 0xff,          low & 0xff);
                    }
                } else {
                    // uint
                    if (mix < 0x80) {
                        this.m_buf.push(mix); // positive fixnum
                    } else if (mix < 0x100) { // uint 8
                        this.m_buf.push(0xcc, mix);
                    } else if (mix < 0x10000) { // uint 16
                        this.m_buf.push(0xcd, mix >> 8, mix & 0xff);
                    } else if (mix < 0x100000000) { // uint 32
                        this.m_buf.push(0xce, mix >>> 24, (mix >> 16) & 0xff,
                            (mix >>  8) & 0xff, mix & 0xff);
                    } else {
                        high = Math.floor(mix / 0x100000000);
                        low  = mix & 0xffffffff;
                        this.m_buf.push(0xcf, (high >> 24) & 0xff, (high >> 16) & 0xff,
                            (high >>  8) & 0xff,         high & 0xff,
                            (low  >> 24) & 0xff, (low  >> 16) & 0xff,
                            (low  >>  8) & 0xff,          low & 0xff);
                    }
                }
            }
        }

        /**
         * encode int64 or uint64 from hex string
         * @param int64 hex string
         */
        packInt64FromHexStr(int64: string) {
            //TODO when int64<0, the encode is wrong
            var hi: number, li: number;
            var hs: string, ls: string;
            hs = (int64+'').replace(/^0x/, '');
            ls = hs.substr(-8);
            hs = hs.length > 8 ? hs.substr(0, hs.length - 8) : '';
            hi = parseInt(hs, 16);
            li = parseInt(ls, 16);
            var neg: Boolean = hi < 0 || li < 0;
            if (neg) {
                this.m_buf.push(0xd3);
                hi = Math.abs(hi);
                li = Math.abs(li);
            } else {
                this.m_buf.push(0xcf);
            }
            var b = this.m_buf, o = this.m_buf.length;
            for (var i = 7; i >=0; i--) {
                b[o+i] = li & 0xff;
                li = i == 4 ? hi : li >> 8;
            }
            if (neg) {
                var carry: number = 1;
                for (i = 7; i >=0; i--) {
                    var v: number = (b[o+i] ^ 0xff) + carry;
                    b[o+i] = v & 0xff;
                    carry = v >> 8;
                }
            }
        }
        packFloat(mix: number) {
            // THX!! @edvakf
            // http://javascript.g.hatena.ne.jp/edvakf/20101128/1291000731
            var sign: Boolean = mix < 0;
            sign && (mix *= -1);

            // add offset 1023 to ensure positive
            // 0.6931471805599453 = Math.LN2;
            var exp: number  = ((Math.log(mix) / 0.6931471805599453) + 1023) | 0;

            // shift 52 - (exp - 1023) bits to make integer part exactly 53 bits,
            // then throw away trash less than decimal point
            var frac: number = mix * Math.pow(2, 52 + 1023 - exp);

            //  S+-Exp(11)--++-----------------Fraction(52bits)-----------------------+
            //  ||          ||                                                        |
            //  v+----------++--------------------------------------------------------+
            //  00000000|00000000|00000000|00000000|00000000|00000000|00000000|00000000
            //  6      5    55  4        4        3        2        1        8        0
            //  3      6    21  8        0        2        4        6
            //
            //  +----------high(32bits)-----------+ +----------low(32bits)------------+
            //  |                                 | |                                 |
            //  +---------------------------------+ +---------------------------------+
            //  3      2    21  1        8        0
            //  1      4    09  6
            var low: number  = frac & 0xffffffff;
            sign && (exp |= 0x800);
            var high: number = ((frac / 0x100000000) & 0xfffff) | (exp << 20);

            this.m_buf.push(0xcb, (high >> 24) & 0xff, (high >> 16) & 0xff,
                (high >>  8) & 0xff,  high        & 0xff,
                (low  >> 24) & 0xff, (low  >> 16) & 0xff,
                (low  >>  8) & 0xff,  low         & 0xff);
        } //function packfloat
        packString(str: string) {
            // http://d.hatena.ne.jp/uupaa/20101128
            var iz: number = str.length;
            var pos: number = this.m_buf.length; // keep rewrite position
            var i: number, size: number;
            this.m_buf.push(0); // placeholder

            // utf8.encode
            for (i = 0; i < iz; ++i) {
                var c: number = str.charCodeAt(i);
                if (c < 0x80) { // ASCII(0x00 ~ 0x7f)
                    this.m_buf.push(c & 0x7f);
                } else if (c < 0x0800) {
                    this.m_buf.push(((c >>>  6) & 0x1f) | 0xc0, (c & 0x3f) | 0x80);
                } else if (c < 0x10000) {
                    this.m_buf.push(((c >>> 12) & 0x0f) | 0xe0,
                        ((c >>>  6) & 0x3f) | 0x80, (c & 0x3f) | 0x80);
                }
            }
            size = this.m_buf.length - pos - 1;

            if (size < 32) {
                this.m_buf[pos] = 0xa0 + size; // rewrite
            } else if (size < 0x10000) { // 16
                this.m_buf.splice(pos, 1, 0xda, size >> 8, size & 0xff);
            } else if (size < 0x100000000) { // 32
                this.m_buf.splice(pos, 1, 0xdb,
                    size >>> 24, (size >> 16) & 0xff,
                    (size >>  8) & 0xff, size & 0xff);
            }
        }
        packArrayHead(length: number) {
            if (length < 16) {
                this.m_buf.push(0x90 + length);
            } else if (length < 0x10000) {
                this.m_buf.push(0xdc, length >> 8, length & 0xff);
            } else if (length < 0x100000000) {
                this.m_buf.push(0xdd, length >>> 24, (length >> 16) & 0xff,
                    (length >> 8) & 0xff, length & 0xff);
            }
        }
        packArray(data: Array<any>) {
            var length: number = data.length;
            this.packArrayHead(length);
            for (var i = 0;i < length; i++) {
                this.pack(data[i]);
            }
        }
        packMapHead(length: number) {
            if (length < 16) {
                this.m_buf.push(0x80 + length);
            } else if (length < 0x10000) {
                this.m_buf.push(0xde, length >> 8, length & 0xff);
            } else if (length < 0x100000000) {
                this.m_buf.push(0xdf, length >>> 24, (length >> 16) & 0xff,
                    (length >> 8) & 0xff, length & 0xff);
            }
        }
        packMap(data: any) {
            var pos: number = this.m_buf.length;
            this.m_buf.push(0); //placeholder
            var size: number = 0;
            var i: any;
            for (i in data) {
                if (typeof data[i] !== 'function') {
                    ++size;
                    this.pack(i);
                    this.pack(data[i]);
                }
            }
            if (size < 16) {
                this.m_buf[pos] = 0x80 + size;
            } else if (size < 0x10000) {
                this.m_buf.splice(pos, 1, 0xde, size >> 8, size & 0xff);
            } else if (size < 0x100000000) {
                this.m_buf.splice(pos, 1, 0xdf, size >>> 24,
                    (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff);
            }
        }
        packBin(data: Array<number>, length: number) {
            if (length < 1 << 8) {
                this.m_buf.push(0xc4, length & 0xff);
            } else if (length < 1 << 16) {
                this.m_buf.push(0xc5, (length >> 8) & 0xff, length & 0xff);
            } else {
                this.m_buf.push(0xc6, (length >>> 24), (length >> 16) & 0xff,
                    (length >> 8) & 0xff, length & 0xff);
            }
            for (var i = 0; i < length; ++i) {
                this.m_buf.push(data[i] & 0xff);
            }
        }

        pack(data: any): MsgpackType {
            var size: number, i: number;
            if (data == null) {
                this.packNil();
                return MsgpackType.Nil;
            } else if (data === false || data === true) {
                this.packBool(data);
                return MsgpackType.Bool;
            } else {
                switch (typeof data) {
                    case "number":
                        if (data !== data) {
                            this.packNaN();
                            return MsgpackType.Float;
                        } else if (data === Infinity) {
                            this.packInfinity();
                            return MsgpackType.Float;
                        } else if (Math.floor(data) === data) {
                            this.packInt(data);
                            return MsgpackType.Int;
                        } else {
                            this.packFloat(data);
                            return MsgpackType.Float;
                        }
                        break;
                    case "string":
                        this.packString(data);
                        return MsgpackType.Str;
                        break;
                    case "function":
                        //ignore
                        return MsgpackType.Nil;
                        break;
                    default :
                        if (_isArray(data)) {
                            this.packArray(data);
                            return MsgpackType.Arr;
                        } else {
                            this.packMap(data);
                            return MsgpackType.Map;
                        }

                }
            }
        }
    }

    export class MsgpackObj {
        public objType: MsgpackType;
        public m_value: any;
        constructor(type: MsgpackType, value: any) {
            this.objType = type;
            this.m_value = value;
        }
        getValue(): any {
            return this.m_value;
        }
    }
    export class Unpacker {
        private m_buf: Array<number>;
        private m_totalLength: number;
        private m_curPos: number;
        setStream(buffer: Array<number>) {
            this.m_buf = buffer;
            this.m_curPos = -1;
            this.m_totalLength = buffer.length;
        }
        setOffset(offset: number) {
            this.m_curPos = offset - 1;
        }
        getOffset(): number {
            return this.m_curPos + 1;
        }
        unpack(): MsgpackObj {
            var size: number, i: number, iz: number,
                iz: number, c: number, num: number = 0;
            var sign: number, exp: number, frac: number, ans: number,
                hi: number, lo: number;
            var hash;
            var ary: Array<any>;
            var hexStr: string, lowHex: string, highHex: string;
            var type: number = this.m_buf[++this.m_curPos];
            if (type >= 0xe0) {
                return new MsgpackObj(MsgpackType.Int, type - 0x100);
            }
            if (type < 0xc0) {
                if (type < 0x80) {
                    return new MsgpackObj(MsgpackType.Int, type);
                }
                if (type < 0x90) {
                    num = type - 0x80;
                    type = 0x80;
                } else if (type < 0xa0) {
                    num = type - 0x90;
                    type = 0x90;
                } else {
                    num = type - 0xa0;
                    type = 0xa0;
                }
            }
            switch (type) {
                case 0xc0: return new MsgpackObj(MsgpackType.Nil, null);
                case 0xc2: return new MsgpackObj(MsgpackType.Bool, false);
                case 0xc3: return new MsgpackObj(MsgpackType.Bool, true);
                case 0xca: //float
                    num = this.m_buf[++this.m_curPos] * 0x1000000 +
                        (this.m_buf[++this.m_curPos] << 0x16) +
                        (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                    sign = num & 0x80000000;
                    exp = (num >> 23) & 0xff;
                    frac = num & 0x7fffff;
                    if (!num || num === 0x80000000) {
                        return new MsgpackObj(MsgpackType.Float, 0);
                    }
                    if (exp === 0xff) {
                        return new MsgpackObj(MsgpackType.Float,
                                            frac ? NaN : Infinity);
                    }
                    ans = (sign ? -1 : 1) *
                        (frac | 0x800000) * Math.pow(2, exp - 127 - 23); // 127: bias
                    return new MsgpackObj(MsgpackType.Float, ans);
                case 0xcb: //double
                    num = this.m_buf[++this.m_curPos] * 0x1000000 +
                        (this.m_buf[++this.m_curPos] << 16) +
                        (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                    sign = num & 0x80000000;
                    exp = (num >> 20) & 0x7ff;
                    frac = num & 0xfffff;
                    if (!num || num === 0x80000000) {
                        this.m_curPos += 4;
                        return new MsgpackObj(MsgpackType.Float, 0);
                    }
                    if (exp === 0x7ff) {
                        this.m_curPos += 4;
                        return new MsgpackObj(MsgpackType.Float,
                                        frac ? NaN : Infinity);
                    }
                    num = this.m_buf[++this.m_curPos] * 0x1000000 +
                        (this.m_buf[++this.m_curPos] << 16) +
                        (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                    ans = (sign ? -1 : 1) *
                        ((frac | 0x100000) * Math.pow(2, exp - 1023 - 20) // 1023: bias
                        + num * Math.pow(2, exp - 1023 - 52));
                    return new MsgpackObj(MsgpackType.Float, ans);
                case 0xcf: //uint64
                case 0xd3: //int64
                    sign = this.m_buf[++this.m_curPos];
                    if (sign & 0x80) {
                        hi = (sign                          ^ 0xff) * 0x1000000 +
                            (this.m_buf[++this.m_curPos]    ^ 0xff) *   0x10000 +
                            (this.m_buf[++this.m_curPos]    ^ 0xff) *     0x100 +
                            (this.m_buf[++this.m_curPos]    ^ 0xff);
                        lo = (this.m_buf[++this.m_curPos]   ^ 0xff) * 0x1000000 +
                            (this.m_buf[++this.m_curPos]    ^ 0xff) *   0x10000 +
                            (this.m_buf[++this.m_curPos]    ^ 0xff) *     0x100 +
                            (this.m_buf[++this.m_curPos]    ^ 0xff);
                        lo += 1;
                        if (lo == 0x100000000) {
                            lo = 0;
                            hi += 1;
                        }
                        if (hi == 0) {
                            lo = lo * -1;
                        } else {
                            hi = hi * -1;
                        }
                    } else {
                        hi = sign * 0x1000000 +
                            (this.m_buf[++this.m_curPos] << 16) +
                            (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                        lo = this.m_buf[++this.m_curPos] * 0x1000000 +
                            (this.m_buf[++this.m_curPos] << 16) +
                            (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                    }

                    num = hi * 0x100000000 + lo;
                    if (num > MAX_INT || num < MIN_INT) {
                        //javascript int range is -2^53 ~ 2^53 or will lost accuracy
                        //so change it to Hex string
                        highHex = hi.toString(16);
                        lowHex = lo.toString(16);
                        for (i = lowHex.length; i < 8; i++) {
                            lowHex = '0' + lowHex;
                        }
                        hexStr = highHex + lowHex;
                        return new MsgpackObj(MsgpackType.Int64Hex, hexStr);
                    }
                    else {
                        return new MsgpackObj(MsgpackType.Int, num);
                    }
                case 0xce: num += this.m_buf[++this.m_curPos] * 0x1000000 +
                    (this.m_buf[++this.m_curPos] << 16);
                case 0xcd: num += this.m_buf[++this.m_curPos] << 8;
                case 0xcc: return new MsgpackObj(MsgpackType.Int, num + this.m_buf[++this.m_curPos]);
                case 0xd2: num = this.m_buf[++this.m_curPos] * 0x1000000 +
                    (this.m_buf[++this.m_curPos] << 16) +
                    (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                    ans = num < 0x80000000 ? num : num - 0x100000000; // 0x80000000 * 2
                    return new MsgpackObj(MsgpackType.Int, ans);
                case 0xd1: num = (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                    ans = num < 0x8000 ? num : num - 0x10000;
                    return new MsgpackObj(MsgpackType.Int, ans);
                case 0xd0: num = this.m_buf[++this.m_curPos];
                    ans = num < 0x80 ? num : num - 0x100;
                    return new MsgpackObj(MsgpackType.Int, ans);
                case 0xdb: num += this.m_buf[++this.m_curPos] * 0x1000000 + (this.m_buf[++this.m_curPos] << 16);
                case 0xda: num += this.m_buf[++this.m_curPos] << 8;
                case 0xd9: num += this.m_buf[++this.m_curPos];
                case 0xa0: //utf8.decode
                    for (ary = [], i = this.m_curPos, iz = i + num; i < iz; ) {
                        c = this.m_buf[++i];
                        ary.push(c < 0x80 ? c : // ASCII(0x00 ~ 0x7f)
                                 c < 0xe0 ? ((c & 0x1f) <<  6 | (this.m_buf[++i] & 0x3f)) :
                                            ((c & 0x0f) << 12 | (this.m_buf[++i] & 0x3f) << 6
                                                              | (this.m_buf[++i] & 0x3f)));
                    }
                    this.m_curPos = i;
                    ans = ary.length < 10240 ? _toString.apply(null, ary)
                                             : byteArrayToByteString(ary);
                    return new MsgpackObj(MsgpackType.Str, ans);
                // 0xc6: bin32, 0xc6: bin16, 0xc4: bin8
                case 0xc6: num += this.m_buf[++this.m_curPos] * 0x1000000 + (this.m_buf[++this.m_curPos] << 16);
                case 0xc5: num += this.m_buf[++this.m_curPos] << 8;
                case 0xc4: num += this.m_buf[++this.m_curPos];
                    var end: number = ++this.m_curPos + num;
                    var ret: Array<number> = this.m_buf.slice(this.m_curPos, end);
                    this.m_curPos += num;
                    return new MsgpackObj(MsgpackType.Bin, ret);
                // 0xdf: map32, 0xde: map16, 0x80: map
                case 0xdf: num += this.m_buf[++this.m_curPos] * 0x1000000 + (this.m_buf[++this.m_curPos] << 16);
                case 0xde: num += (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                case 0x80:
                    hash = {};
                    while (num--) {
                        size = this.m_buf[++this.m_curPos] - 0xa0;

                        for (ary = [], i = this.m_curPos, iz = i + size; i < iz; ) {
                            c = this.m_buf[++i];
                            ary.push(c < 0x80 ? c : // ASCII(0x00 ~ 0x7f)
                                     c < 0xe0 ? ((c & 0x1f) <<  6 | (this.m_buf[++i] & 0x3f)) :
                                                ((c & 0x0f) << 12 | (this.m_buf[++i] & 0x3f) << 6
                                                                  | (this.m_buf[++i] & 0x3f)));
                        }
                        this.m_curPos = i;
                        hash[_toString.apply(null, ary)] = this.unpack().getValue();
                    }
                    return new MsgpackObj(MsgpackType.Map, hash);
                // 0xdd: array32, 0xdc: array 16, 0x90: array
                case 0xdd: num += this.m_buf[++this.m_curPos] * 0x1000000 + (this.m_buf[++this.m_curPos] << 16);
                case 0xdc: num += (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                case 0x90:
                    ary = [];
                    while (num--) {
                        ary.push(this.unpack().getValue());
                    }
                    return new MsgpackObj(MsgpackType.Arr, ary);
            }
        }
    }
    /**
     * unpack one data from a stream begin with offset
     * @param buffer packed data source
     * @param offset offset
     * @param result unpacked data
     * @returns {number} offset after unpack
     */
    export function unpack(buffer: Array<number>, offset: number,
                           result: MsgpackObj): number {
        var unpacker: Unpacker = new Unpacker();
        unpacker.setStream(buffer);
        unpacker.setOffset(offset);
        var ret: MsgpackObj = unpacker.unpack();
        result.m_value = ret.m_value;
        result.objType = ret.objType;
        return unpacker.getOffset();
    }

    /**
     * use for debug
     * @param buffer
     * @param offset
     * @private
     */
    export function _prettyPrint(buffer: Array<number>, offset: number) {
        var unpacker: Unpacker = new Unpacker();
        var i: number;
        unpacker.setStream(buffer);
        unpacker.setOffset(offset);
        document.writeln('<p><ol>');
        while (offset < buffer.length) {
            var data: MsgpackObj = unpacker.unpack();
            var value: any = data.getValue();
            offset = unpacker.getOffset();
            switch (data.objType) {
                case MsgpackZ.MsgpackType.Arr:
                    document.writeln('<li>Array: [');
                    for (i = 0; i < value.length; i++) {
                        document.write(value[i] + ', ');
                    }
                    document.write(']</li>');
                    break;
                case MsgpackZ.MsgpackType.Int:
                    document.writeln('<li>Int: ' + value.toString() + '</li>');
                    break;
                case MsgpackZ.MsgpackType.Float:
                    document.writeln('<li>Float: ' + value.toString() + '</li>');
                    break;
                case MsgpackZ.MsgpackType.Str:
                    document.writeln('<li>String: "' + value + '"</li>');
                    break;
                case MsgpackZ.MsgpackType.Bool:
                    document.writeln('<li>Boolean: ' + value.toString() + '</li>');
                    break;
                case MsgpackZ.MsgpackType.Nil:
                    document.writeln('<li>null or undefined</li>');
                    break;
                case MsgpackZ.MsgpackType.Int64Hex:
                    document.writeln('<li>Hex Int: ' + value + '</li>');
                    break;
                case MsgpackZ.MsgpackType.Bin:
                    document.writeln('<li>Bin: ' + value.toString() + '</li>');
                    break;
                case MsgpackZ.MsgpackType.Map:
                    document.writeln('<li>Map: ' + JSON.stringify(value) + '</li>');
                    break;
                case MsgpackZ.MsgpackType.Ext:
                    document.writeln('<li>Ext: ' + value.toString() + '</li>');
                    break;
            }
        }
        document.writeln('</ol></p>');
    }
}

