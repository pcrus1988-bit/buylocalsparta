declare module "pdfmake/build/pdfmake.js" {
  const pdfMake: any;
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts.js" {
  const fonts: any;
  export default fonts;
  export const pdfMake: any;
}
