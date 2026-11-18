import type {Metadata} from 'next';
import {terms} from '../../content/legal';
import {LegalDocument} from '../legal/LegalDocument';
export const metadata:Metadata={title:'Terms of Service | SantaBlizard',description:terms.description,alternates:{canonical:'https://santablizard.com/terms'}};
export default function TermsPage(){return <LegalDocument document={terms}/>;}
