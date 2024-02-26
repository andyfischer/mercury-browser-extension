
import { Schema, compileSchema } from '../table'

let _genericListResponse: Schema;
let _genericSingleValueResponse: Schema;

type ResponseSchemaName = 'single_value' | 'list'

export function getResponseSchema(name: ResponseSchemaName) {
    switch (name) {

    case 'single_value':
        if (!_genericSingleValueResponse) {
            _genericSingleValueResponse = compileSchema({
                name: 'GenericSingleValueResponse',
                funcs: [
                    'get',
                    'getStatus',
                    'listen',
                    'listenToStream',
                ]
            });
        }

        return _genericSingleValueResponse;

    case 'list':
        if (!_genericListResponse) {
            _genericListResponse = compileSchema({
                name: 'GenericListResponse',
                funcs: [
                    'each',
                    'listAll',
                    'deleteAll',
                    'getStatus',
                    'listen',
                    'listenToStream',
                    'count',
                ]
            })
        }
        return _genericListResponse;

    default:
        return null;
    }
}
