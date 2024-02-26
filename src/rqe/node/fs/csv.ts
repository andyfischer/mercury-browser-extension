
import { Stream, c_item, c_done, } from '../../Stream';
import { streamToCsv, Options } from '../../csv'
import Fs from 'fs'

export function streamToCsvFile(input: Stream, options: Options, filename: string) {
    // Open a file stream and write the CSV to it.

    const fileOut = Fs.createWriteStream(filename);

    streamToCsv(input, options)
    .sendTo(evt => {
        switch (evt.t) {
            case c_item:
                fileOut.write(evt.item.line + '\n')
                break;
            case c_done:
                fileOut.close();
    }});
}
