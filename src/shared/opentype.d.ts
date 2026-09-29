// opentype.js ships without type definitions; this covers the part used to measure caption text.
declare module 'opentype.js' {
  interface Font {
    getAdvanceWidth(text: string, fontSize?: number, options?: { kerning?: boolean }): number
  }
  interface OpenType {
    parse(buffer: ArrayBuffer): Font
  }
  const opentype: OpenType
  export default opentype
}
