
export function serializeArray(arr: Uint32Array) {
    return String.fromCharCode.apply(null, arr);
}

export function deserializeArray(str: string) {
  var buf = new ArrayBuffer(str.length * 4);
  var bufView = new Uint32Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
  }

  return bufView;
}

