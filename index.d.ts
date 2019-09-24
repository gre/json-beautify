/*
* json-beautify typings
* @author TeodorDre
* @Github - https://github.com/TeodorDre
*
*/

declare module 'json-beautify' {
  export default function beautify (value: any, replacer: Function | object | any[] | null, space: number | string, limit?: number): string
}
