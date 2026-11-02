import {afterEach,expect,it} from 'vitest';
import {languages,setLanguage,formatNumber} from '@/i18n';
import {GAME_URL,homeShareText,resultShareText} from './platform';
afterEach(()=>setLanguage('ja'));
function weight(text:string){return [...text.replaceAll(GAME_URL,'x'.repeat(23))].reduce((sum,char)=>sum+(char.codePointAt(0)!>0x10ff?2:1),0);}
for(const [language] of languages)it(`${language}: official tags preserve real current result and fit X`,()=>{
 setLanguage(language);
 const home=homeShareText();
 for(const score of [0,1234,2147483647]){
  const result=resultShareText({score,rank:'A',elapsed:42,reachedWave:4,counters:3,simultaneousDefeats:1,cardsUsed:5});
  expect(result).toContain(formatNumber(score));
  for(const text of [home,result]){
   expect(text).toContain('#マスメン #ゲーム制作');expect(text.split('#マスメン')).toHaveLength(2);expect(text.split('#ゲーム制作')).toHaveLength(2);
   expect(text).toContain(GAME_URL);expect(weight(text)).toBeLessThanOrEqual(280);
  }
 }
});
