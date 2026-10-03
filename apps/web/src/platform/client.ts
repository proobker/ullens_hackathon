import { create } from 'zustand';
export type Theme='light'|'dark';
export const usePreferences=create<{language:'en'|'ne';setLanguage:(language:'en'|'ne')=>void;theme:Theme;setTheme:(theme:Theme,remember?:boolean)=>void}>(set=>({
  language:'en',setLanguage:language=>{localStorage.setItem('pran-language',language);document.documentElement.lang=language;set({language});},
  // Light until the user explicitly chooses; only an explicit choice is remembered.
  theme:'light',setTheme:(theme,remember=true)=>{if(remember){try{localStorage.setItem('pran-theme',theme);}catch{}}document.documentElement.dataset.theme=theme;set({theme});},
}));
export async function api<T=unknown>(path:string,body?:unknown,method?:string):Promise<T> {
  const response=await fetch('/api/'+path,{method:method??(body===undefined?'GET':'POST'),credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=response.status===204?null:await response.json();
  if(!response.ok)throw new Error(data?.error?.message??'Request failed');
  return data as T;
}
export const requestId=()=>crypto.randomUUID();
export const labels={
  en:{patient:'Patient',paramedic:'Paramedic',hospital:'Hospital',lab:'Lab',signIn:'Sign in',signOut:'Sign out',records:'Health records',source:'Source',release:'Emergency release',save:'Save release',revoke:'Revoke release',receipts:'Access receipts',sign:'Sign clinical record',dispatch:'Initiate pre-arrival dispatch',scan:'Read paired RFID scanner',manual:'Resolve locator',offline:'Prepare offline copy',booking:'Book review appointment',report:'Add patient report',review:'Review due',synthetic:'Synthetic demonstration',refresh:'Refresh',confirm:'I have confirmed patient linkage',purpose:'Access reason',name:'Username',password:'Password',dark:'Dark',light:'Light',toDark:'Switch to dark mode',toLight:'Switch to light mode'},
  ne:{patient:'बिरामी',paramedic:'प्यारामेडिक',hospital:'अस्पताल',lab:'प्रयोगशाला',signIn:'साइन इन',signOut:'साइन आउट',records:'स्वास्थ्य अभिलेख',source:'स्रोत',release:'आपत्कालीन अनुमति',save:'अनुमति सुरक्षित गर्नुहोस्',revoke:'अनुमति रद्द गर्नुहोस्',receipts:'पहुँच विवरण',sign:'अभिलेखमा हस्ताक्षर गर्नुहोस्',dispatch:'अस्पताललाई सूचना पठाउनुहोस्',scan:'RFID स्क्यान पढ्नुहोस्',manual:'परिचायक खोज्नुहोस्',offline:'अफलाइन प्रति तयार गर्नुहोस्',booking:'जाँच समय बुक गर्नुहोस्',report:'बिरामीको विवरण थप्नुहोस्',review:'पुनरावलोकन मिति',synthetic:'कृत्रिम प्रदर्शन',refresh:'ताजा गर्नुहोस्',confirm:'मैले बिरामीको पहिचान पुष्टि गरेको छु',purpose:'पहुँचको कारण',name:'प्रयोगकर्ता नाम',password:'पासवर्ड',dark:'गाढा',light:'उज्यालो',toDark:'गाढा मोडमा बदल्नुहोस्',toLight:'उज्यालो मोडमा बदल्नुहोस्'}
} as const;
