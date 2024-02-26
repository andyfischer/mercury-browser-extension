
import { lazySchema } from '../rqe'

export interface APIPath {
    path: string
    description: string
    method: 'get'
    parameters?: any[]
    internalRequestName?: string
    responses?: any
}

const APIPathSchema = lazySchema<APIPath>({
    name: 'APIPaths',
    attrs: ['path', 'id(auto)'],
    funcs: []
});

export const APIPaths = APIPathSchema.createTable();

APIPaths.insert({
    path: '/tabs',
    method: 'get',
    description: 'Get the list of all open browser tabs',
    internalRequestName: 'ListLiveTabs',
});

APIPaths.insert({
    path: '/tab/{tabId}/html',
    method: 'get',
    description: 'Get the full HTML from the given tab',
    parameters: [{
        name: 'tabId',
        required: true,
        in: 'path',
        description: 'The tab ID',
    }],
    internalRequestName: 'GetHTMLForTab',
    responses: {
        404: {
            description: "The tab ID was not found",
        }
    }
});

APIPaths.insert({
    path: '/tab/{tabId}/info',
    method: 'get',
    description: 'Get top-level information about the given tab',
    internalRequestName: 'GetTabInfo',
    parameters: [{
        name: 'tabId',
        required: true,
        in: 'path',
        description: 'The tab ID',
    }],
    responses: {
        404: {
            description: "The tab ID was not found",
        }
    }
});

APIPaths.insert({
    path: '/tab/{tabId}/element/{selector}/html',
    method: 'get',
    description: 'Fetch the HTML for the given selector in the given tab. Uses the first match if there are multiple.',
    internalRequestName: 'GetHTMLForElement',
    parameters: [{
        name: 'tabId',
        required: true,
        in: 'path',
        description: 'The tab ID',
    },{
        name: 'selector',
        required: true,
        in: 'path',
        description: 'The element selector',
    }],
    responses: {
        404: {
            description: "The tab ID or the element was not found",
        }
    }
});