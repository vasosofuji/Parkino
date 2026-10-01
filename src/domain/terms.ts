export function termsParagraphs(t: (en: string, mk: string) => string) {
  return [
    t(
      "Use this parking app only when it is safe. Do not interact with it while driving.",
      "Користете ја апликацијата само кога е безбедно. Не користете ја додека возите.",
    ),
    t(
      "Parking locations, prices and availability can change. Check the signs where you park and follow local parking rules. The app does not reserve spaces or collect parking payments.",
      "Локациите, цените и достапноста може да се променат. Проверете ги таблите каде што паркирате и почитувајте ги локалните правила. Апликацијата не резервира места и не наплаќа паркинг.",
    ),
    t(
      "Share information you believe is accurate and photos you have the right to share. Do not upload faces, registration plates, private information or abusive content.",
      "Споделувајте информации за кои верувате дека се точни и слики за кои имате право на споделување. Не прикачувајте лица, регистарски таблички, приватни податоци или навредлива содржина.",
    ),
    t(
      "Parking contributions and sign photos are public. You allow the app to store, display and process them for the shared map. Google Gemini may process sign photos to read prices, hours and zone labels.",
      "Придонесите за паркирање и сликите од табли се јавни. Дозволувате апликацијата да ги чува, прикажува и обработува за заедничката мапа. Google Gemini може да ги обработува сликите за читање цени, работно време и ознаки на зони.",
    ),
    t(
      "Location is used on your device to find nearby parking and detect a stop. GPS accuracy depends on your device and surroundings. Your GPS history is not uploaded. Address searches and map/navigation requests are processed by their providers.",
      "Локацијата се користи на вашиот уред за блиски паркинзи и откривање запирање. Прецизноста на GPS зависи од уредот и околината. GPS историјата не се испраќа. Пребарувањата на адреси и барањата за мапи/навигација ги обработуваат нивните даватели.",
    ),
    t(
      "Guest contributions and points stay with this device until you create an account. Your username, contributions and points belong to your account. Save your password to sign in after reinstalling; email password reset is not available yet. Existing device accounts need to add a password in Account first. You can delete your account, photos and reports in Privacy. Published parking locations and boundaries remain on the shared map. Contribution points have no monetary value.",
      "Придонесите и поените на гостите остануваат на овој уред додека не создадете сметка. Корисничкото име, придонесите и поените ѝ припаѓаат на вашата сметка. Зачувајте ја лозинката за најава по повторна инсталација; обновување преку е-пошта сè уште нема. Постојните сметки прво треба да додадат лозинка во Сметка. Сметката, сликите и пријавите може да ги избришете во Приватност. Објавените паркинзи и граници остануваат на мапата. Поените немаат парична вредност.",
    ),
  ];
}
