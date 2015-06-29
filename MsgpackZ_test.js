/**
 *
 * Created by lichong on 15/6/29.
 */

var msgpack = new MsgpackZ.Packer();

msgpack.packArray(2);
msgpack.packInt64FromHexStr("-0x4");
msgpack.packFloat(0.1234);

msgpack.__debugOutput();
