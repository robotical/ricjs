/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class RICStruct {
  _rechk = /^([<>])?(([1-9]\d*)?([xcbB?hHiIfdsp]))*$/;
  _refmt = /([1-9]\d*)?([xcbB?hHiIfdsp])/g;
  _format = '';
  _outBufferDataView = new DataView(new Uint8Array(0).buffer);
  _outBufPos = 0;
  _inBufferDataView = new DataView(new Uint8Array(0).buffer);
  _inBufPos = 0;
  _strPos = 0;
  _formedStr = '';
  _argIdx = 0;
  _littleEndian = false;

  constructor(format: string) {
    // Validate format
    const regexRslt = this._rechk.exec(format);
    if (!regexRslt) {
      throw new RangeError('Invalid format string');
    }

    // Format processing
    let fPos = 0;
    this._format = '';

    // Check for endian-ness indicator
    if (fPos < format.length) {
      if (format.charAt(fPos) == '<') {
        this._littleEndian = true;
        fPos++;
      } else if (format.charAt(fPos) == '>') {
        this._littleEndian = false;
        fPos++;
      }
    }

    // Expand numbers in the format
    while (fPos < format.length) {
      // Process current position in the format code
      let repeatLenCode = parseInt(format.substr(fPos), 10);
      if (isNaN(repeatLenCode)) {
        repeatLenCode = 1;
      } else {
        while (
          fPos < format.length &&
          format.charAt(fPos) >= '0' &&
          format.charAt(fPos) <= '9'
        )
          fPos++;
      }

      // Expand the single char to multiple (even in the case of string)
      for (let i = 0; i < repeatLenCode; i++) {
        this._format += format[fPos];
      }

      // In the case of strings we need to know when to move on to the next variable
      if (format[fPos] == 's') this._format += '0';

      // Next
      fPos++;
    }
  }

  size(): number {
    let outLen = 0;
    let fPos = 0;
    while (fPos < this._format.length) {
      let elLen = 0;
      switch (this._format[fPos]) {
        case 'x': {
          elLen = 1;
          break;
        }
        case '?': {
          elLen = 1;
          break;
        }
        case 'c': {
          elLen = 1;
          break;
        }
        case 'b': {
          elLen = 1;
          break;
        }
        case 'B': {
          elLen = 1;
          break;
        }
        case 'h': {
          elLen = 2;
          break;
        }
        case 'H': {
          elLen = 2;
          break;
        }
        case 'i': {
          elLen = 4;
          break;
        }
        case 'I': {
          elLen = 4;
          break;
        }
        case 'f': {
          elLen = 4;
          break;
        }
        case 'd': {
          elLen = 8;
          break;
        }
        case 's': {
          elLen = 1;
          break;
        }
        // this code used to indicate string end
        case '0': {
          elLen = 0;
          break;
        }
      }
      outLen += elLen;
      fPos += 1;
    }
    return outLen;
  }

  _packElem(fPos: number, arg: number | string | boolean): number {
    // Handle struct code
    let argInc = 1;
    switch (this._format[fPos]) {
      case 'x': {
        // Skip
        this._outBufPos++;
        argInc = 0;
        break;
      }
      case '?': {
        // Boolean byte value
        this._outBufferDataView.setInt8(this._outBufPos, arg ? -1 : 0);
        this._outBufPos++;
        break;
      }
      case 'c': {
        // Char
        this._outBufferDataView.setInt8(
          this._outBufPos,
          (arg as string).charCodeAt(0),
        );
        this._outBufPos++;
        break;
      }
      case 'b': {
        // Signed byte
        this._outBufferDataView.setInt8(this._outBufPos, Number(arg));
        this._outBufPos++;
        break;
      }
      case 'B': {
        // Unsigned byte
        this._outBufferDataView.setUint8(this._outBufPos, Number(arg));
        this._outBufPos++;
        break;
      }
      case 'h': {
        // Signed 16 bit
        this._outBufferDataView.setInt16(
          this._outBufPos,
          Number(arg),
          this._littleEndian,
        );
        this._outBufPos += 2;
        break;
      }
      case 'H': {
        // Unsigned 16 bit
        this._outBufferDataView.setUint16(
          this._outBufPos,
          Number(arg),
          this._littleEndian,
        );
        this._outBufPos += 2;
        break;
      }
      case 'i': {
        // Signed 32 bit
        this._outBufferDataView.setInt32(
          this._outBufPos,
          Number(arg),
          this._littleEndian,
        );
        this._outBufPos += 4;
        break;
      }
      case 'I': {
        // Unsigned 16 bit
        this._outBufferDataView.setUint32(
          this._outBufPos,
          Number(arg),
          this._littleEndian,
        );
        this._outBufPos += 4;
        break;
      }
      case 'f': {
        // Float (32 bit)
        this._outBufferDataView.setFloat32(
          this._outBufPos,
          Number(arg),
          this._littleEndian,
        );
        this._outBufPos += 4;
        break;
      }
      case 'd': {
        // Double (64 bit)
        this._outBufferDataView.setFloat64(
          this._outBufPos,
          Number(arg),
          this._littleEndian,
        );
        this._outBufPos += 8;
        break;
      }
      case 's': {
        const inStr = arg as string;
        const chVal =
          inStr.length >= this._strPos ? inStr.charCodeAt(this._strPos++) : 0;
        this._outBufferDataView.setUint8(this._outBufPos, chVal);
        this._outBufPos += 1;
        argInc = 0;
        break;
      }
      case '0': {
        // This is to indicate string termination
        this._strPos = 0;
      }
    }
    this._argIdx += argInc;
    return fPos + 1;
  }

  packInto(
    buffer: Uint8Array,
    offset: number,
    ...args: Array<number | string | boolean>
  ) {
    this._outBufPos = offset;
    this._outBufferDataView = new DataView(buffer.buffer);
    this._strPos = 0;
    // Iterate format string
    this._argIdx = 0;
    let fPos = 0;
    while (fPos < this._format.length) {
      if (this._argIdx >= args.length) break;
      fPos = this._packElem(fPos, args[this._argIdx]);
    }
  }

  pack(...args: Array<number | string | boolean>): Uint8Array {
    // Generate out buffer
    const outBuffer = new Uint8Array(this.size());
    this.packInto(outBuffer, 0, ...args);
    return outBuffer;
  }

  _unpackElem(
    fPos: number,
    outArray: Array<number | string | boolean>,
  ): number {
    // Handle struct code
    switch (this._format[fPos]) {
      case 'x': {
        // Skip
        this._inBufPos += 1;
        break;
      }
      case '?': {
        // Boolean byte value
        outArray.push(
          this._inBufferDataView.getUint8(this._inBufPos) != 0 ? true : false,
        );
        this._inBufPos += 1;
        break;
      }
      case 'c': {
        // Character
        const charCode = this._inBufferDataView.getInt8(this._inBufPos);
        outArray.push(String.fromCharCode(charCode));
        this._inBufPos += 1;
        break;
      }
      case 'b': {
        // Signed 8 bit
        outArray.push(this._inBufferDataView.getInt8(this._inBufPos));
        this._inBufPos += 1;
        break;
      }
      case 'B': {
        // Unsigned 8 bit
        outArray.push(this._inBufferDataView.getUint8(this._inBufPos));
        this._inBufPos += 1;
        break;
      }
      case 'h': {
        // Signed 16 bit
        outArray.push(
          this._inBufferDataView.getInt16(this._inBufPos, this._littleEndian),
        );
        this._inBufPos += 2;
        break;
      }
      case 'H': {
        // Unsigned 16 bit
        outArray.push(
          this._inBufferDataView.getUint16(this._inBufPos, this._littleEndian),
        );
        this._inBufPos += 2;
        break;
      }
      case 'i': {
        // Signed 32 bit
        outArray.push(
          this._inBufferDataView.getInt32(this._inBufPos, this._littleEndian),
        );
        this._inBufPos += 4;
        break;
      }
      case 'I': {
        // Unsigned 32 bit
        outArray.push(
          this._inBufferDataView.getUint32(this._inBufPos, this._littleEndian),
        );
        this._inBufPos += 4;
        break;
      }
      case 'f': {
        // Float (32 bit)
        outArray.push(
          this._inBufferDataView.getFloat32(this._inBufPos, this._littleEndian),
        );
        this._inBufPos += 4;
        break;
      }
      case 'd': {
        // Double (64 bit)
        outArray.push(
          this._inBufferDataView.getFloat64(this._inBufPos, this._littleEndian),
        );
        this._inBufPos += 8;
        break;
      }
      case 's': {
        // String
        const chCode = this._inBufferDataView.getInt8(this._inBufPos);
        this._formedStr += String.fromCharCode(chCode);
        this._inBufPos += 1;
        break;
      }
      case '0': {
        // String termination
        outArray.push(this._formedStr);
        this._formedStr = '';
      }
    }
    return fPos + 1;
  }

  unpackFrom(buffer: Uint8Array, offset: number): Array<number | string> {
    // Get DataView onto input buffer
    this._inBufferDataView = new DataView(buffer.buffer);
    const outArray = new Array<number | string>();
    this._formedStr = '';

    // Iterate format string
    let fPos = offset;
    this._inBufPos = 0;
    while (fPos < this._format.length) {
      fPos = this._unpackElem(fPos, outArray);
    }
    return outArray;
  }

  unpack(inBuf: Uint8Array): Array<number | string> {
    return this.unpackFrom(inBuf, 0);
  }
}
