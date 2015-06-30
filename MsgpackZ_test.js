/**
 *
 * Created by lichong on 15/6/29.
 */

var msgpack = new MsgpackZ.Packer();
var msgunpack = new MsgpackZ.Unpacker();

msgpack.packInt64FromHexStr("-0x1");
msgpack.packFloat(0.1234);
msgpack.packString("this is a test");
msgpack.packInt64FromHexStr("0x12345678");
msgpack.packInt64FromHexStr('-0xabcd14930489331');

msgpack.packArrayHead(10);
for (var i = 0; i < 10; i++) {
    msgpack.packInt(i);
}

msgpack.pack([1,2,3,4,5]);
msgpack.pack({"haha":true, "lala":1234});

msgpack.__debugOutput();

var stream = msgpack.getStream();

MsgpackZ._prettyPrint(stream, 0);

