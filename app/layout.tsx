import type {Metadata} from "next";import "./globals.css";
export const metadata:Metadata={title:"CloudX — Private cloud storage",description:"30 GB free private cloud storage"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}