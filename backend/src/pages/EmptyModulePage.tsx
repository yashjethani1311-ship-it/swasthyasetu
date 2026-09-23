import { Card, EmptyState } from '@/components/kit'
export function EmptyModulePage({title,text}:{title:string;text:string}){return <div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">This module will display only real records created through the live workflow.</p><Card className="mt-6"><EmptyState text={text}/></Card></div>}
