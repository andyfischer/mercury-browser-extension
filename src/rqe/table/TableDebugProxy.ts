
import { Schema } from './Schema'

export function wrapTableInDebugProxy(schema: Schema, table: any) {
    return new Proxy(table, {
        get(target, methodOrAttributeName) {
            if (target.hasOwnProperty(methodOrAttributeName)) {
                return target[methodOrAttributeName];
            }

            // ignore some common attributes that get checked for
            if (methodOrAttributeName === 'then' || methodOrAttributeName === 'catch')
                return undefined;

            // error case
            if (methodOrAttributeName === 'listen') {
                throw new Error(
                    `Schema ${schema.name} doesn't support .listen() (fix: add 'listen' to funcs)`);
            }

            throw new Error(`${schema.name} table doesn't support: ${String(methodOrAttributeName)}()`);
        }
    });
}
