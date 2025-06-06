declare module 'react-native-html-parser' {
  export class DOMParser {
    parseFromString(htmlString: string, mimeType: string): Document;
  }
  
  export interface Document {
    querySelector(selector: string): Element | null;
    querySelectorAll(selector: string): NodeList;
  }
  
  export interface Element {
    textContent: string | null;
    getAttribute(name: string): string | null;
    children: HTMLCollection;
  }
  
  export interface NodeList {
    length: number;
    [index: number]: Element;
  }
  
  export interface HTMLCollection {
    length: number;
    [index: number]: Element;
  }
} 