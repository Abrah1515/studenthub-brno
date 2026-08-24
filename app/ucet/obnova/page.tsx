import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
export const metadata:Metadata={title:"Obnova hesla",robots:{index:false,follow:false}};
export default function PasswordRecoveryPage(){return <div className="page-stack auth-page"><PageHeading eyebrow="Zabezpečení účtu" title="Obnova hesla" description="Nastavte nové heslo k dobrovolnému účtu StudentHub."/><PasswordRecoveryForm/></div>;}
