
/*jslint browser: true, node: true */
/*global require, module */

"use strict";

const NIFTI1 = require('./nifti1.js');

/*** Imports ***/

/**
 * nifti
 * @type {*|{}}
 */
var nifti = nifti || {};
nifti.NIFTI1 = nifti.NIFTI1 || ((typeof require !== 'undefined') ? require('./nifti1.js') : null);
nifti.NIFTI2 = nifti.NIFTI2 || ((typeof require !== 'undefined') ? require('./nifti2.js') : null);
nifti.Utils = nifti.Utils || ((typeof require !== 'undefined') ? require('./utilities.js') : null);

var pako = pako || ((typeof require !== 'undefined') ? require('pako') : null);



/*** Static Methods ***/

/**
 * Returns true if this data represents a NIFTI-1 header.
 * @param {ArrayBuffer} data
 * @returns {boolean}
 */
nifti.isNIFTI1 = function (data) {
    var buf, mag1, mag2, mag3;

    if (data.byteLength < nifti.NIFTI1.STANDARD_HEADER_SIZE) {
        return false;
    }

    buf = new DataView(data);

    if (buf)

    mag1 = buf.getUint8(nifti.NIFTI1.MAGIC_NUMBER_LOCATION);
    mag2 = buf.getUint8(nifti.NIFTI1.MAGIC_NUMBER_LOCATION + 1);
    mag3 = buf.getUint8(nifti.NIFTI1.MAGIC_NUMBER_LOCATION + 2);

    return !!((mag1 === nifti.NIFTI1.MAGIC_NUMBER[0]) && (mag2 === nifti.NIFTI1.MAGIC_NUMBER[1]) &&
        (mag3 === nifti.NIFTI1.MAGIC_NUMBER[2]));
};


/**
 * Returns true if this data represents a NIFTI-2 header.
 * @param {ArrayBuffer} data
 * @returns {boolean}
 */
nifti.isNIFTI2 = function (data) {
    var buf, mag1, mag2, mag3;

    if (data.byteLength < nifti.NIFTI1.STANDARD_HEADER_SIZE) {
        return false;
    }

    buf = new DataView(data);
    mag1 = buf.getUint8(nifti.NIFTI2.MAGIC_NUMBER_LOCATION);
    mag2 = buf.getUint8(nifti.NIFTI2.MAGIC_NUMBER_LOCATION + 1);
    mag3 = buf.getUint8(nifti.NIFTI2.MAGIC_NUMBER_LOCATION + 2);

    return !!((mag1 === nifti.NIFTI2.MAGIC_NUMBER[0]) && (mag2 === nifti.NIFTI2.MAGIC_NUMBER[1]) &&
    (mag3 === nifti.NIFTI2.MAGIC_NUMBER[2]));
};



/**
 * Returns true if this data represents a NIFTI header.
 * @param {ArrayBuffer} data
 * @returns {boolean}
 */
nifti.isNIFTI = function (data) {
    return (nifti.isNIFTI1(data) || nifti.isNIFTI2(data));
};



/**
 * Returns true if this data is GZIP compressed.
 * @param {ArrayBuffer} data
 * @returns {boolean}
 */
nifti.isCompressed = function (data) {
    var buf, magicCookie1, magicCookie2;

    if (data) {
        buf = new DataView(data);

        magicCookie1 = buf.getUint8(0);
        magicCookie2 = buf.getUint8(1);

        if (magicCookie1 === nifti.Utils.GUNZIP_MAGIC_COOKIE1) {
            return true;
        }

        if (magicCookie2 === nifti.Utils.GUNZIP_MAGIC_COOKIE2) {
            return true;
        }
    }

    return false;
};



/**
 * Returns decompressed data.
 * @param {ArrayBuffer} data
 * @returns {ArrayBuffer}
 */
nifti.decompress = function (data) {
    return pako.inflate(data).buffer;
};



/**
 * Reads and returns the header object.
 * @param {ArrayBuffer} data
 * @returns {nifti.NIFTI1|nifti.NIFTI2|null}
 */
nifti.readHeader = function (data) {
    var header = null;

    if (nifti.isCompressed(data)) {
        data = nifti.decompress(data);
    }

    if (nifti.isNIFTI1(data)) {
        header = new nifti.NIFTI1();
    } else if (nifti.isNIFTI2(data)) {
        header = new nifti.NIFTI2();
    }

    if (header) {
        header.readHeader(data);
    } else {
        console.error("That file does not appear to be NIFTI!");
    }

    return header;
};



/**
 * Returns true if this header contains an extension.
 * @param {nifti.NIFTI1|nifti.NIFTI2} header
 * @returns {boolean}
 */
nifti.hasExtension = function (header) {
    return (header.extensionFlag[0] != 0);
};



/**
 * Returns the image data.
 * @param {nifti.NIFTI1|nifti.NIFTI2} header
 * @param {ArrayBuffer} data
 * @returns {ArrayBuffer}
 */
nifti.readImage = function (header, data) {
    var imageOffset = header.vox_offset,
        timeDim = 1,
        statDim = 1;

    if (header.dims[4]) {
        timeDim = header.dims[4];
    }

    if (header.dims[5]) {
        statDim = header.dims[5];
    }

    var imageSize = header.dims[1] * header.dims[2] * header.dims[3] * timeDim * statDim * (header.numBitsPerVoxel / 8);
    return data.slice(imageOffset, imageOffset + imageSize);
};

/**
 * Returns true if image is planar. 
 * @param {nifti.NIFTI1|nifti.NIFTI2} header
 * @param {ArrayBuffer} data
 * @returns {boolean}
 */
nifti.isPlanar = function(header, data) {
    if(header.dims[2] < 2) return false; //requires at least 2 rows of data
    var incPlanar = header.dims[1]; //increment next row of PLANAR image
    var incPacked = header.dims[1] * 3; //increment next row of PACKED image
    var byteSlice = incPacked * header.dims[2]; //bytes per 3D slice of RGB data
    var dxPlanar = 0.0;
    var dxPacked = 0.0;
    var pos = header.dims[3]/2 * byteSlice; //offset to middle slice for 3D data
    var niftiImage = nifti.readImage(header, data);
    var rgbData = new Uint8Array(niftiImage);
    var posEnd = pos + byteSlice - incPacked;
    while (pos < posEnd) {
        dxPlanar += abs(rgbData[pos]-rgbData[pos+incPlanar]);
        dxPacked += abs(rgbData[pos]-rgbData[pos+incPacked]);
        pos++;
    }

    return (dxPlanar < dxPacked);
}

/**
 * Returns converted 24 bit RBG data array to 32 bit RGBA array
 * @param {nifti.NIFTI1|nifti.NIFTI2} header 
 * @param {ArrayBuffer} data 
 * @returns {ArrayBuffer}
 */
nifti.convert2RGBA = function(header, data) {
    if(header.datatypeCode != nifti.NIFTI1.TYPE_RGB24) {
        return data;
    }
    
    var voxCount = header.dims[1] * header.dims[2] * header.dims[3];
    var rgbaData = new Uint8Array(voxCount * 4); 
    var isPlanar = nifti.isPlanar(header, data);

    var nx = header.dims[1];
    var ny = header.dims[2];
    var nz = header.dims[3];

    var o = 0;

    var niftiImage = nifti.readImage(header, data);
    var rgbData = new Uint8Array(niftiImage);
    if(!isPlanar) {
        var i = 0;
        for(var vx = 0; vx < voxCount; vx++) {
            rgbaData[o++] = rgbData[i++]; //red
            rgbaData[o++] = rgbData[i++]; //green
            rgbaData[o++] = rgbData[i++]; //blue
            rgbaData[o++] = rgbData[i-2] / 2; //green best estimate for alpha
        }
    }
    else {
        var nxy = nx*ny; //number of voxels in a plane
        var nxy3 = nxy*3; //size for group of RGB planes
        var sliceR =0;
        var sliceG =nxy;
        var sliceB = nxy+nxy;
        var row = 0;
        for (var vol= 0; vol < nvol; vol++) {
            for (var z = 0; z < nz; z++) { //for each slice
                row = 0; //start of row
                for (var y = 0; y < ny; y++) { //for each row
                    for (var x = 0; x < nx; x++) { //for each column
                        rgbaData[o++] = rgbData[sliceR+row+x];
                        rgbaData[o++] = rgbData[sliceG+row+x];
                        rgbaData[o++] = rgbData[sliceB+row+x];
                        rgbaData[o++] = rgbData[sliceG+row+x] /2; //green best estimate for alpha   666 2016
                    } //for each x
                    row = row + nx;
                } //for each y
                sliceR = sliceR + nxy3; //start of red plane
                sliceG = sliceG + nxy3; //start of green plane
                sliceB = sliceB + nxy3; //start of blue plane
            } //for each z
        }
    }

    return rgbaData;
}


/**
 * Returns the extension data (including extension header).
 * @param {nifti.NIFTI1|nifti.NIFTI2} header
 * @param {ArrayBuffer} data
 * @returns {ArrayBuffer}
 */
nifti.readExtension = function (header, data) {
    var loc = header.getExtensionLocation(),
        size = header.extensionSize;

    return data.slice(loc, loc + size);
};



/**
 * Returns the extension data.
 * @param {nifti.NIFTI1|nifti.NIFTI2} header
 * @param {ArrayBuffer} data
 * @returns {ArrayBuffer}
 */
nifti.readExtensionData = function (header, data) {
    var loc = header.getExtensionLocation(),
        size = header.extensionSize;

    return data.slice(loc + 8, loc + size - 8);
};


/*** Exports ***/

var moduleType = typeof module;
if ((moduleType !== 'undefined') && module.exports) {
    module.exports = nifti;
}
