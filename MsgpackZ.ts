/**
 *
 * Created by lichong on 15/6/26.
 */
module MsgpackZ {
    var _toString = String.fromCharCode;
    var _num2bin: Array<string>, _bin2num: Array<number>;

    enum MsgpackType {
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
            var hi: number, li: number;
            var hs: string, ls: string;
            hs = (int64+'').replace(/^0x/, '');
            ls = hs.substr(-8);
            hs = hs.length > 8 ? hs.substr(0, hs.length - 8) : '';
            hi = parseInt(hs, 16);
            li = parseInt(ls, 16);
            if (hi < 0) {
                this.m_buf.push(0xd3);
            } else {
                this.m_buf.push(0xcf);
            }
            this.m_buf.push((hi >> 24) & 0xff,  (hi >> 16) & 0xff,
                            (hi >>  8) & 0xff,          hi & 0xff,
                            (li >> 24) & 0xff,  (li >> 16) & 0xff,
                            (li >>  8) & 0xff,          li & 0xff);
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
        packArray(length: number) {
            if (length < 16) {
                this.m_buf.push(0x90 + length);
            } else if (length < 0x10000) {
                this.m_buf.push(0xdc, length >> 8, length & 0xff);
            } else if (length < 0x100000000) {
                this.m_buf.push(0xdd, length >>> 24, (length >> 16) & 0xff,
                    (length >> 8) & 0xff, length & 0xff);
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
    }

    export class MsgpackObj {
        public objType: MsgpackType;
        private m_value: any;
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
        decode(): MsgpackObj {
            var size: number, i: number, iz: number,
                iz: number, c: number, num: number = 0;
            var sign: number, exp: number, frac: number, ans: number,
                hi: number, lo: number;
            var hash;
            var ary: Array<number>;
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
                        //TODO can it been a int64 hex string?
                        hash[_toString.apply(null, ary)] = this.decode().getValue();
                    }
                    return new MsgpackObj(MsgpackType.Map, hash);
                // 0xdd: array32, 0xdc: array 16, 0x90: array
                case 0xdd: num += this.m_buf[++this.m_curPos] * 0x1000000 + (this.m_buf[++this.m_curPos] << 16);
                case 0xdc: num += (this.m_buf[++this.m_curPos] << 8) + this.m_buf[++this.m_curPos];
                case 0x90:
                    ary = [];
                    while (num--) {
                        ary.push(this.decode().getValue());
                    }
                    return new MsgpackObj(MsgpackType.Arr, ary);
            }
        }
    }
}
