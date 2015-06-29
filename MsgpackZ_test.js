/**
 *
 * Created by lichong on 15/6/29.
 */

var msgpack = new MsgpackZ.Packer();
var msgunpack = new MsgpackZ.Unpacker();

msgpack.packInt64FromHexStr("-0x1");
msgpack.packFloat(0.1234);
msgpack.packString("this is a test");
msgpack.packInt64FromHexStr("-1");
msgpack.packInt64FromHexStr('-0x122312312312131');

msgpack.__debugOutput();

var stream = msgpack.getStream();

MsgpackZ._prettyPrint(stream, 0);

