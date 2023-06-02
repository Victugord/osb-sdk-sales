export function sdk(): string {
  return '1.0.6';
}

import { XMLParser } from 'fast-xml-parser';
import { gzip } from 'pako';

const CHUNK_SIZE = 1024 * 1024 * 128;
const alwaysArray = [
  'AuditFile.MasterFiles.Product',
  'AuditFile.SourceDocuments.SalesInvoices.Invoice.Line',
  'AuditFile.MasterFiles.TaxTable.TaxTableEntry'
];
const PARSER = new XMLParser({
  numberParseOptions: {
    hex: false,
    leadingZeros: false,
    skipLike: /^\d*\.?\d*$/,
  },
  isArray: (name, jpath, isLeafNode, isAttribute) => {
    if (alwaysArray.indexOf(jpath) !== -1) return true;
    return false;
  },
});

export interface IAuthenticate {
  clientId: string;
  clientSecret: string;
}

export interface IAuthenticateResult {
  expiresOn: number;
  schema: string;
  timeScale: string;
  token: string;
}

export interface ISaftUpload {
  file: File;
  nif?: string;
  id?: string;
}

export interface ICustomerTokenRequest {
  id: string;
  nif: string;
  year: string;
  nextYear: string;
  name: string;
}

export const ConvertSaft = async (
  { file, nif, id }: ISaftUpload,
  debug?: boolean
) => {
  try {
    const encoding = await detectCharset(file);

    let contentBlob: Blob = new Blob([], { type: 'text/xml' });
    let data: string = '';
    if (file.size > CHUNK_SIZE) {
      const chunks = Math.ceil(file.size / CHUNK_SIZE);
      for (let i = 0; i < chunks; i++) {
        console.log(`parsing chunk${i} / ${chunks - 1}`);
        const start = i * CHUNK_SIZE;
        const end =
          file.size > (i + 1) * CHUNK_SIZE ? (i + 1) * CHUNK_SIZE : file.size;
        const blob = file.slice(start, end);
        const value = await readBlobAsync(blob, encoding);
        //remove new lines and double spaces
        const trimed = value
          .replace(/(\r\n|\n|\r)/gm, '')
          .replace(/\s+/g, ' ')
          .trim();
        data += trimed;
      }
    } else {
      contentBlob = file.slice(0, file.size);
      const value = await readBlobAsync(contentBlob, encoding);
      const trimed = value
        .replace(/(\r\n|\n|\r)/gm, '')
        .replace(/\s+/g, ' ')
        .trim();

      data = trimed;
    }

    let j = PARSER.parse(data);

    try {
      j.AuditFile.MasterFiles.Customer = j.AuditFile.MasterFiles.Customer.map(
        (customer: any) => {
          return {
            ...customer,
            Fax: '' + customer.Fax,
            Telephone: '' + customer.Telephone,
          };
        }
      );

      j.AuditFile.MasterFiles.Supplier = [];
    } catch (error) {
      j = '';
    }

    if (debug) {
      console.log({ debug: j });
    }
    const nBlob = new Blob([gzip(JSON.stringify(j))]);

    const nfile = new File([nBlob], `${id}_${nif}_.json.gz`);

    return nfile;
  } catch (e) {
    console.error(e);
  }
};

function readBlobAsync(file: Blob, encoding: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      console.log('error detected');
      reject();
    };

    reader.readAsText(file, encoding);
  });
}
const detectCharset = async (file: Blob) => {
  const copyFile = file.slice(0, 250);
  const content = await copyFile.text();
  const xmlEncodingRegex = /encoding="(.*?)"/;
  const encodingMatch = content.match(xmlEncodingRegex);
  const encoding = encodingMatch ? encodingMatch[1] : null;

  if (
    encoding?.toLowerCase() === 'windows-1252' ||
    encoding?.toLowerCase() === 'asscii'
  ) {
    return encoding;
  }

  return 'utf-8';
};
