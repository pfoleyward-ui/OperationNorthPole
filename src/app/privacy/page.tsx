import type {Metadata} from 'next';
import {privacy} from '../../content/legal';
import {LegalDocument} from '../legal/LegalDocument';
export const metadata:Metadata={title:'Privacy Policy | SantaBlizard',description:privacy.description,alternates:{canonical:'https://santablizard.com/privacy'}};
export default function PrivacyPage(){return <LegalDocument document={privacy}/>;}
