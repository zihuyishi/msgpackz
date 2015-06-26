/**
 *
 * Created by lichong on 15/6/26.
 */
module MsgpackZ {
    export class Packer {
        private m_buf: Array<number>;
        constructor() {
            this.m_buf = [];
        }

        getStream(): Array<number> {
            return this.m_buf;
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
    export class Unpacker {

    }
}
