
import { compileSchema } from "../table";

export const TestCases = compileSchema({
    name: "TestCases",
    attrs: [
        'id(auto)'
    ],
    funcs: [
        'listAll',
    ]
}).createTable();

export const TestFailures = compileSchema({
    name: "TestFailures",
    attrs: [
        'id(auto)'
    ],
    funcs: [
        'each'
    ]
}).createTable();
