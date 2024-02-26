

export function zeroPad(num: number|string, len: number) {
    num = num + '';
    while (num.length < len)
        num = '0' + num;
    return num;
}
