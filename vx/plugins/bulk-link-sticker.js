import axios from "axios";
import sharp from "sharp";
import { Module } from "../lib/plugins.js";
import { isOwnerMessage } from "./groupstatus.js";
import fs from "fs";
import path from "path";

/*
 * ============================================================
 * GROUP LINK + STICKER BULK SENDER
 * ============================================================
 *
 * Supported:
 *   10 link
 *   10 links
 *   10 sticker
 *   10 stickers
 *
 * Admin/owner only. Bot must be group admin.
 *
 * Safety limits:
 *   MAX_BULK = 100
 *   DELAY_MS = 200ms between messages (fast mode)
 *
 * Sticker URLs:
 *   Put direct image/GIF URLs in STICKER_URLS below.
 *   The command cycles through the URLs when the requested
 *   count is greater than the number of configured URLs.
 *
 * Stop an active run:
 *   .stopbulk
 * ============================================================
 */

const MAX_BULK = 100;
const DELAY_MS = 200;

const LINK_CONFIG_FILE = path.join(
  process.cwd(),
  "data",
  "bulk-group-link.json"
);

function loadConfiguredGroupLink() {
  try {
    if (!fs.existsSync(LINK_CONFIG_FILE)) return "";
    const data = JSON.parse(fs.readFileSync(LINK_CONFIG_FILE, "utf8"));
    return typeof data?.link === "string" ? data.link.trim() : "";
  } catch (error) {
    console.error("[bulk] failed to load configured group link:", error);
    return "";
  }
}

function saveConfiguredGroupLink(link) {
  const dir = path.dirname(LINK_CONFIG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    LINK_CONFIG_FILE,
    JSON.stringify({ link, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

// Add your direct image/GIF URLs here.
// Example:
// "https://example.com/sticker1.png",
// "https://example.com/sticker2.jpg",
const STICKER_URLS = [
  "https://konachan.com/sample/1155676c3d40044e9e68cc8c5a8a70e1/Konachan.com%20-%20316708%20sample.jpg",
  "https://konachan.com/sample/d7b1e0f18c3dd52e5698f09ff088255c/Konachan.com%20-%20316687%20sample.jpg", "https://telegra.ph/file/7d28ac87406e8c7c1306a.jpg",
  "https://telegra.ph/file/b5bf3ed7143b951bedf11.jpg",
  "https://telegra.ph/file/a1723d4fea338ba124e01.jpg",
  "https://telegra.ph/file/90a3ca0eea933d3ee4b5c.jpg",
  "https://telegra.ph/file/3cad3f00b4a712eecc715.jpg",
  "https://telegra.ph/file/0f0eabce74a6bc2200e38.jpg",
  "https://telegra.ph/file/818387c2e695bca10930c.jpg",
  "https://telegra.ph/file/ac97041eec98fe85c3c77.jpg",
  "https://telegra.ph/file/57dd8bc92c4c7ae795d04.jpg",
  "https://telegra.ph/file/eb5075b6f927df688e88e.jpg",
  "https://telegra.ph/file/ddec62ccb66c91c4e8715.jpg",
  "https://telegra.ph/file/06a95378bd05eb63818dd.jpg",
  "https://telegra.ph/file/569efe6760e75ec17c7d3.jpg",
  "https://telegra.ph/file/cde02c2662e19cfcd1793.jpg",
  "https://telegra.ph/file/cdf2a72dc7337d31347b1.jpg",
  "https://telegra.ph/file/664ab73b2d847eb9446cb.jpg",
  "https://telegra.ph/file/a7d5b52b71545a7ee1147.jpg",
  "https://telegra.ph/file/ab2c4273daec75b9821a7.jpg",
  "https://telegra.ph/file/8e96a7e94ce73d9363b03.jpg",
  "https://telegra.ph/file/395ecf9c6b2c5cbe743f3.jpg",
  "https://telegra.ph/file/89a593b1252bd4d9d8e18.jpg",
  "https://telegra.ph/file/0135c95c7bd400b268fcc.jpg",
  "https://telegra.ph/file/dc98164d0d9bbf3a447ac.jpg",
  "https://telegra.ph/file/42f77282f8aef52e734cd.jpg",
  "https://telegra.ph/file/a36b6472618e4a54ddde4.jpg",
  "https://telegra.ph/file/c881380b92d21bdc5789d.jpg",
  "https://telegra.ph/file/842d6765b45dfe223b5b8.jpg",
  "https://telegra.ph/file/dcda4fd29f6ce501d97a6.jpg",
  "https://telegra.ph/file/0c89fdc50fdec66f61c90.jpg",
  "https://telegra.ph/file/48af56e832fcf7127f709.jpg",
  "https://telegra.ph/file/dd7c10e96d877f7f3be87.jpg",
  "https://telegra.ph/file/d05da75ff5b0cc5f8a785.jpg",
  "https://telegra.ph/file/0a4328d59c51904c97d6e.jpg",
  "https://telegra.ph/file/0160a96f6e4cf4e4b8a8a.jpg",
  "https://telegra.ph/file/3f1e65a9148a7f102d710.jpg",
  "https://telegra.ph/file/7bb8267e7ea58a39d1063.jpg",
  "https://telegra.ph/file/cd60bca7aac4e2c953287.jpg",
  "https://telegra.ph/file/6524b635fc159fcf99933.jpg",
  "https://telegra.ph/file/e87a78ced73f840dc1259.jpg",
  "https://telegra.ph/file/46d7c09c8cad741117439.jpg",
  "https://telegra.ph/file/fd363a19c2f3250d7c24e.jpg",
  "https://telegra.ph/file/23c0589a96a43ef3053a4.jpg",
  "https://telegra.ph/file/6b813e12cb982747606be.jpg",
  "https://telegra.ph/file/6a007ca3d1555392ef6fa.jpg",
  "https://telegra.ph/file/18f116ffff30d2652bd84.jpg",
  "https://telegra.ph/file/c164de95c290e1efdfc5e.jpg",
  "https://telegra.ph/file/1b939a1a7dd66b6605ebb.jpg",
  "https://telegra.ph/file/12f00c87cb762a38277b7.jpg",
  "https://telegra.ph/file/c50898b7da0461a2f8ac4.jpg",
  "https://telegra.ph/file/1b420bbe4b2c45f3b777c.jpg",
  "https://telegra.ph/file/5207700d8de0f20117ab4.jpg",
  "https://telegra.ph/file/b2dd81ecf2518a3c748a6.jpg",
  "https://telegra.ph/file/b101d09d89b8715b429ba.jpg",
  "https://telegra.ph/file/5b33991378ff363c8da78.jpg",
  "https://telegra.ph/file/785ea3fb742d8de707167.jpg",
  "https://telegra.ph/file/b118999dfa3f844cd4100.jpg",
  "https://telegra.ph/file/16f1cac6a77b74b9dc6a5.jpg",
  "https://telegra.ph/file/dfa73d586b8df37a2c799.jpg",
  "https://telegra.ph/file/04d961edb0db270db57a6.jpg",
  "https://telegra.ph/file/decec6cc0f95abe93837a.jpg",
  "https://telegra.ph/file/95381d37842ebd9cdd1ca.jpg",
  "https://telegra.ph/file/d94640f5bdd8a864827e8.jpg",
  "https://telegra.ph/file/69b21184b004cb709b2e6.jpg",
  "https://telegra.ph/file/2ccac6027ac83313df2c5.jpg",
  "https://telegra.ph/file/0bf5edc0c7313527cf616.jpg",
  "https://telegra.ph/file/3462b85ddc357c2e758ec.jpg",
  "https://telegra.ph/file/9d0b068f2c98cfe27cd07.jpg",
  "https://telegra.ph/file/e1a98b61c615be801790d.jpg",
  "https://telegra.ph/file/2823003f688e83c6bb0b0.jpg",
  "https://telegra.ph/file/d3f2a78ed51e87a62cd38.jpg",
  "https://telegra.ph/file/afa75914e31bbf39fe6cd.jpg",
  "https://telegra.ph/file/21fbac6c6057b5f5243b5.jpg",
  "https://telegra.ph/file/a3bbdbe0f6b8f48f7dd04.jpg",
  "https://telegra.ph/file/bc2c098d087f60e4576a2.jpg",
  "https://telegra.ph/file/8132639dbb623a7a91289.jpg",
  "https://telegra.ph/file/51654363733b46fa457e3.jpg",
  "https://telegra.ph/file/d75cf4d024335465ed7a5.jpg",
  "https://telegra.ph/file/718a58ad4f72a2dc83542.jpg",
  "https://telegra.ph/file/ed3b8c576343e8cc139a4.jpg",
  "https://telegra.ph/file/1e2dbdb7684a7b0516d2a.jpg",
  "https://telegra.ph/file/ce8a5112f6223ce8407f8.jpg",
  "https://telegra.ph/file/63badce8a2c0c60ef83a6.jpg",
  "https://telegra.ph/file/f7d8c690dfa98d1f0ac96.jpg",
  "https://telegra.ph/file/b09a91b63856985e5bc3c.jpg",
  "https://telegra.ph/file/9e372dd78ec9c6d2a362b.jpg",
  "https://telegra.ph/file/649cfe999157eaee91527.jpg",
  "https://telegra.ph/file/94808fe884e4c9e39ad10.jpg",
  "https://telegra.ph/file/f91abdb6ae78d1d5d3b86.jpg",
  "https://telegra.ph/file/4398e6efd42c652ddae49.jpg",
  "https://telegra.ph/file/13f315d8c6f4df30019ad.jpg",
  "https://telegra.ph/file/3b16f1a6b2f0776181579.jpg",
  "https://telegra.ph/file/b4a33aec7e825143ff416.jpg",
  "https://telegra.ph/file/749a4d9b2709a8ef86e4c.jpg",
  "https://telegra.ph/file/cae91acd160a664f4de1e.jpg",
  "https://telegra.ph/file/9be2f7fad382c6e04b774.jpg",
  "https://telegra.ph/file/3e011b4c63654b9f0d937.jpg",
  "https://telegra.ph/file/5f0293951b662a6ee43a8.jpg",
  "https://telegra.ph/file/e757b34f2d5c2e031cf56.jpg",
  "https://telegra.ph/file/e4b899438b8345f990f2a.jpg",
  "https://telegra.ph/file/91541797a80a411af0b2e.jpg",
  "https://telegra.ph/file/faefd526ad447d190a09c.jpg",
  "https://telegra.ph/file/0a768d9f56b01312d33f8.jpg",
  "https://telegra.ph/file/baebfc2a0acde90c7ed8b.jpg",
  "https://telegra.ph/file/461cf9783a782e6efc708.jpg",
  "https://telegra.ph/file/b034be668beb00ca02d25.jpg",
  "https://telegra.ph/file/5e50b8215323fce8c0a97.jpg",
  "https://telegra.ph/file/20d0fb163ad7803f189fa.jpg",
  "https://telegra.ph/file/cc64267e36304ad4d9b97.jpg",
  "https://telegra.ph/file/b82c57a7c1146465ac20d.jpg",
  "https://telegra.ph/file/9026fe1cbb1a84480f8ef.jpg",
  "https://telegra.ph/file/be7a8978be9035dfdff44.jpg",
  "https://telegra.ph/file/5cd4d03f5589981049e50.jpg",
  "https://telegra.ph/file/d0bae647351916f43c79c.jpg",
  "https://telegra.ph/file/d63ec25fef93cfc7692f0.jpg",
  "https://telegra.ph/file/ece98d56257c6b997964b.jpg",
  "https://telegra.ph/file/9c55d6a5c982bb3d12de0.jpg",
  "https://telegra.ph/file/d069a6df15b59a26618ca.jpg",
  "https://telegra.ph/file/b02bdb1f5f6e9b8350278.jpg",
  "https://telegra.ph/file/8c29e0ef95ac2a44edac6.jpg",
  "https://telegra.ph/file/143fddda61ebd78bd0730.jpg",
  "https://telegra.ph/file/c0ed4474c38ac81d580dc.jpg",
  "https://telegra.ph/file/7fdf8f3a890cbf6e759e6.jpg",
  "https://telegra.ph/file/0eb08b067cd4dd76e9fbd.jpg",
  "https://telegra.ph/file/05c7a98f684733f921f2b.jpg",
  "https://telegra.ph/file/b4ba6e26ac0ddf6286abb.jpg",
  "https://telegra.ph/file/c378495e0e434fc933265.jpg",
  "https://telegra.ph/file/2063bca16ee02a176d174.jpg",
  "https://telegra.ph/file/07ee1525027a75464b6eb.jpg",
  "https://telegra.ph/file/748efe6e7c5e0e9c49672.jpg",
  "https://telegra.ph/file/fd9153deb1f46fd47082c.jpg",
  "https://telegra.ph/file/3df7ca6b9e8535502905f.jpg",
  "https://telegra.ph/file/64e3f8f9663e75a99b805.jpg",
  "https://telegra.ph/file/165cec1d715e10dd23c3d.jpg",
  "https://telegra.ph/file/47e996f716f3aab360af7.jpg",
  "https://telegra.ph/file/ee491310562b50e864927.jpg",
  "https://telegra.ph/file/4ab63e260a17832909636.jpg",
  "https://telegra.ph/file/338029e6bb1da57282701.jpg", "https://konachan.com/sample/efc2db82a388ecaed8e3214ec2fcf065/Konachan.com%20-%20316542%20sample.jpg",
  "https://konachan.com/sample/f3f6ea463f111501fc8cc2b9b51e5c46/Konachan.com%20-%20316327%20sample.jpg",
  "https://konachan.com/sample/737a707688c52fdfdd74797e76d67ee2/Konachan.com%20-%20316192%20sample.jpg",
  "https://konachan.com/jpeg/a0863dacd6d8ad422e50aeb423d80111/Konachan.com%20-%20316184%20anus%20ass%20blush%20braids%20censored%20kanojo_okarishimasu%20miazi%20nopan%20purple_eyes%20pussy%20red_hair%20sআমিrasawa_sumi%20school_uniform%20skirt%20thighhighs%20waifu2x%20wet.jpg",
  "https://konachan.com/sample/dcaf0a2ad0b79ff1717a18359ec44996/Konachan.com%20-%20316088%20sample.jpg",
  "https://konachan.com/sample/647c499d8b46970042625601133a0d18/Konachan.com%20-%20315321%20sample.jpg",
  "https://konachan.com/jpeg/163ed4cbe0e542484733e18a953683ea/Konachan.com%20-%20313778%20aliasing%20arknights%20black_hair%20blush%20bodhi_wushushenghua%20bondage%20breasts%20chain%20cleavage%20eunectes_%28arknights%29%20flowers%20garter%20goggles%20tail.jpg",
  "https://telegra.ph/file/edc8985cc2f6bfd78f5c8.jpg",
  "https://telegra.ph/file/f93b337c430f307cff68f.jpg",
  "https://telegra.ph/file/0da42b7fcdd50b8113f61.jpg",
  "https://telegra.ph/file/d0fc72c48d8a5626beb94.jpg",
  "https://telegra.ph/file/a2c34fb850bfb194e9e4a.jpg",
  "https://telegra.ph/file/00dbe0a103cb360ee998e.jpg",
  "https://telegra.ph/file/9c6ad4b1f989e995dcf48.jpg",
  "https://telegra.ph/file/e8eea49479c560945fef6.jpg",
  "https://telegra.ph/file/bc219cbbff6016f9b0537.jpg",
  "https://telegra.ph/file/24b9eee8dbf1ce41b61f7.jpg",
  "https://telegra.ph/file/d7c823e27c9617cad2a22.jpg",
  "https://telegra.ph/file/f41721418429dc45638a7.jpg",
  "https://telegra.ph/file/773098b07ce0d34f0df3b.jpg",
  "https://telegra.ph/file/de9e61862b4db269735ea.jpg",
  "https://telegra.ph/file/1125094814a1d6ef60093.jpg",
  "https://telegra.ph/file/a016d96460b1d167ac4ff.jpg",
  "https://telegra.ph/file/9f427830a39e3d3eb5e4c.jpg",
  "https://telegra.ph/file/b05cea98c1032ca487b98.jpg", "https://telegra.ph/file/e0cfae46505053c5ab076.jpg",
  "https://telegra.ph/file/5f7994ef4075ebe4a24f8.jpg",
  "https://telegra.ph/file/478d718b142074b6cc6e9.jpg",
  "https://telegra.ph/file/4f43a5a5e10534d4407d1.jpg",
  "https://telegra.ph/file/3562d7584b300b3f0a3b5.jpg",
  "https://telegra.ph/file/30a813bc2e79d2dae7d46.jpg",
  "https://telegra.ph/file/01fb79bd7d71134814d4b.jpg",
  "https://telegra.ph/file/e1ea698041f1182be399e.jpg",
  "https://telegra.ph/file/9a41272309050fb90c0dd.jpg",
  "https://telegra.ph/file/b8e629277145fab95acdd.jpg",
  "https://telegra.ph/file/0654f301fde639229cb9c.jpg",
  "https://telegra.ph/file/79ceaed6d33026642e1b6.jpg",
  "https://telegra.ph/file/2578c8c350d6840ff527a.jpg",
  "https://telegra.ph/file/10822c6bd8608048b09a8.jpg",
  "https://telegra.ph/file/ce614dad51e4622f4a41f.jpg",
  "https://telegra.ph/file/acf185ee248a6d14ebbdb.jpg",
  "https://telegra.ph/file/95ffff36511969ffa760c.jpg",
  "https://telegra.ph/file/1d547d5a8029ea5e4a543.jpg",
  "https://telegra.ph/file/b40c58a9d32343f6d6e1d.jpg",
  "https://telegra.ph/file/d9c635af37c3f9d5d33e8.jpg",
  "https://telegra.ph/file/34112f9a9e9d88be1959f.jpg",
  "https://telegra.ph/file/b287109c5100cbe4e230a.jpg",
  "https://telegra.ph/file/2a33c2c747de7a1e0a7b2.jpg",
  "https://telegra.ph/file/ae0c4104e4f4f9db6a136.jpg",
  "https://telegra.ph/file/9f3c3469cac06d29aed1e.jpg",
  "https://telegra.ph/file/bd782060856d0a83b6142.jpg",
  "https://telegra.ph/file/6cb708de19b6cf0e82c2d.jpg",
  "https://telegra.ph/file/ff7acd1bcdb5ea0661987.jpg",
  "https://telegra.ph/file/a72362fd263166856f3b3.jpg",
  "https://telegra.ph/file/297111b3cf6e0d1e8051c.jpg",
  "https://telegra.ph/file/83b40c76061310ee258fa.jpg",
  "https://telegra.ph/file/5f9f39ff8723fcf84cf43.jpg",
  "https://telegra.ph/file/3fd3f9be1d428687a2d1f.jpg",
  "https://telegra.ph/file/a3240fbf492d0cbbac68e.jpg",
  "https://telegra.ph/file/cee2dbc7fce8bdd74656e.jpg",
  "https://telegra.ph/file/a0496b23710a5164fe7fc.jpg",
  "https://telegra.ph/file/8065890ea1b8dde92fa84.jpg",
  "https://telegra.ph/file/2fe7ec5f6bddc4817e6cc.jpg",
  "https://telegra.ph/file/f94755a86e9b41eac3f59.jpg", "https://i.pinimg.com/236x/3f/31/e1/3f31e1654143138388fa8c7a9ab35422.jpg",
  "https://i.pinimg.com/236x/28/95/21/2895215c4f863a6cdd4028f780674e36.jpg",
  "https://i.pinimg.com/236x/0e/6f/a4/0e6fa4b94ded13b6e0e0e3904fa0d74b.jpg",
  "https://i.pinimg.com/236x/05/5d/1a/055d1a996c73ac96cb3eb61ce22211cf.jpg",
  "https://i.pinimg.com/236x/53/ad/67/53ad672df89276c1c4ccea8d0ce59197.jpg",
  "https://i.pinimg.com/236x/f1/7b/04/f17b04c73fff451d608adacb75755cfa.jpg",
  "https://i.pinimg.com/236x/b6/1b/5d/b61b5d9b704e556de601fa3a0129ec45.jpg",
  "https://i.pinimg.com/236x/cb/a0/57/cba057ef021851499b83fa21fbfba3a8.jpg",
  "https://i.pinimg.com/236x/b6/a9/bb/b6a9bbed294554c558fc32e525e6957a.jpg",
  "https://i.pinimg.com/236x/24/e3/28/24e3288daec3e5e05a274619ea3ec6a5.jpg",
  "https://i.pinimg.com/236x/c1/4e/1c/c14e1c63a1b28cb1b07819487515fd6b.jpg",
  "https://i.pinimg.com/236x/be/fe/1f/befe1ff49e2a2115fcb9103d48583a43.jpg",
  "https://i.pinimg.com/236x/a8/0d/48/a80d48be2403a1eda578e8bca545054e.jpg",
  "https://i.pinimg.com/236x/2f/b5/68/2fb56865d0f02432d5426c923ce6d447.jpg",
  "https://i.pinimg.com/236x/b2/f1/69/b2f169ca9c63abf27ce2c59ca669727a.jpg",
  "https://i.pinimg.com/236x/e6/c0/26/e6c026c85ffc92f80ba4782ce9ae1953.jpg",
  "https://i.pinimg.com/236x/a0/2d/34/a02d347453af2dc5a6e146cd89a7f2cb.jpg",
  "https://i.pinimg.com/236x/c6/62/c8/c662c88e3e48cf8701fb0bc41c4f3b39.jpg",
  "https://i.pinimg.com/236x/48/00/64/48006405914fd7f0db7bad9fafefa767.jpg",
  "https://i.pinimg.com/236x/9b/22/00/9b2200966b4ac3a6fb045c5d59ed1fce.jpg",
  "https://i.pinimg.com/236x/9a/8c/3e/9a8c3eb56ff11acb6837db51e71c9ed6.jpg",
  "https://i.pinimg.com/236x/d5/37/77/d5377734c773fcab7669c677b520d35e--kawaii.jpg",
  "https://i.pinimg.com/236x/b5/2e/be/b52ebebdb9952137307dbd825d8bb5d5.jpg",
  "https://i.pinimg.com/236x/09/d5/99/09d599d862501ca3e2c95479d86ab759.jpg",
  "https://i.pinimg.com/236x/3c/37/03/3c37033691613e90efd01604b876fd3d.jpg",
  "https://i.pinimg.com/236x/c9/2b/33/c92b3324a9c92c8757cda5a46973f9d0.jpg",
  "https://i.pinimg.com/236x/aa/16/77/aa1677074c72fc759c0244469c009146.jpg",
  "https://i.pinimg.com/236x/50/4e/d4/504ed4438e1500e7e3285a44f3cf9553.jpg",
  "https://i.pinimg.com/236x/28/56/d4/2856d41c68fd2edce9ea093fa932faff.jpg",
  "https://telegra.ph/file/fb5a1a7445fb4bd9f6cab.jpg",
  "https://telegra.ph/file/595731f525527531ab690.jpg",
  "https://telegra.ph/file/495b32014250843ad4da4.jpg",
  "https://telegra.ph/file/1a123eb1938b77d026930.jpg",
  "https://telegra.ph/file/12a0e60c55e28f926495c.jpg",
  "https://telegra.ph/file/26a76ae77078efda40fa5.jpg",
  "https://telegra.ph/file/ab854b72ce9f61ed2e089.jpg",
  "https://telegra.ph/file/df3578e9106cef3a41c89.jpg",
  "https://telegra.ph/file/4fb54eda1dea44e97f681.jpg",
  "https://telegra.ph/file/0a1ff450a21cd5bab7d83.jpg",
  "https://telegra.ph/file/7dc988b73f031d8dd0086.jpg",
  "https://telegra.ph/file/fe6c001a6a2d144f12a29.jpg",
  "https://telegra.ph/file/5b76b29d8f6ec98eab57d.jpg",
  "https://telegra.ph/file/1c9b01179b86f601d2f3c.jpg",
  "https://telegra.ph/file/69cc1e9aa10c5911dfc2d.jpg",
  "https://telegra.ph/file/7c5b6a4b1dced878b5dee.jpg",
  "https://telegra.ph/file/0f43015eb1c2b57a8f715.jpg",
  "https://telegra.ph/file/3e48256fd908d9ef2a8b2.jpg",
  "https://telegra.ph/file/d13b74da9ae33bce07c6e.jpg",
  "https://telegra.ph/file/16fc85197f43fe5e28080.jpg",
  "https://telegra.ph/file/687ac25c4fed7b647d525.jpg",
  "https://telegra.ph/file/95c6b58139047ed63a4bc.jpg",
  "https://telegra.ph/file/6b0b2a9d64c80b8692b8c.jpg",
  "https://telegra.ph/file/71ee2e960e1cb4e3ff0c3.jpg",
  "https://telegra.ph/file/bb50d2cabb158d7c335c3.jpg",
  "https://telegra.ph/file/8905c41b1509d58fac03a.jpg",
  "https://telegra.ph/file/425b75a90e1fc0483202c.jpg",
  "https://telegra.ph/file/100f5959fc634c10ffcf4.jpg",
  "https://telegra.ph/file/2b6d4da831cb1aff414f4.jpg",
  "https://telegra.ph/file/98f478de4bf712797097a.jpg",
  "https://telegra.ph/file/62587c03d8e3c195ed474.jpg",
  "https://telegra.ph/file/2c3c209b8c6ac10efac86.jpg",
  "https://telegra.ph/file/564da7059574eae4eb547.jpg",
  "https://telegra.ph/file/cd4a513ca364efe0117c0.jpg",
  "https://telegra.ph/file/3822f6c57c7b8bb6da5f8.jpg",
  "https://telegra.ph/file/0e2913690ea7b615dd4be.jpg",
  "https://telegra.ph/file/6389c83d11e99f89548ff.jpg",
  "https://telegra.ph/file/61b3ee5345e87c13d1b17.jpg",
  "https://telegra.ph/file/c7b45e820693be90bd243.jpg",
  "https://telegra.ph/file/8c23b5910cbb805df7428.jpg",
  "https://telegra.ph/file/e245728d2ce7cb7caf261.jpg",
  "https://telegra.ph/file/51a04361b72082d6fea01.jpg",
  "https://telegra.ph/file/f5cf50b640f209e1f739e.jpg",
  "https://telegra.ph/file/927b44db4382f4565ee44.jpg",
  "https://telegra.ph/file/0bc65f79f03a294b9b979.jpg",
  "https://telegra.ph/file/f1423b1691233c7b28369.jpg",
  "https://telegra.ph/file/d51a22c85ee58760c6b9d.jpg",
  "https://telegra.ph/file/08ee37091e857e0bae122.jpg",
  "https://telegra.ph/file/089a0114470d5546ce5ae.jpg",
  "https://telegra.ph/file/25f938b10487500111769.jpg",
  "https://telegra.ph/file/1b75e868bdfb74307dc86.jpg",
  "https://telegra.ph/file/77ad081dea38f57d13fb5.jpg",
  "https://telegra.ph/file/a36fe9577e61bfd4de7e1.jpg",
  "https://telegra.ph/file/2683b97eeb21c7cc2c7b8.jpg",
  "https://telegra.ph/file/0efcae3614a4c7585dc20.jpg",
  "https://telegra.ph/file/26f2dcb78b2bc430dc852.jpg",
  "https://telegra.ph/file/a76f31e505788ce286713.jpg",
  "https://telegra.ph/file/bb6caa6d3c7c144ff8336.jpg",
  "https://telegra.ph/file/cad45a614a66cc272b4fe.jpg",
  "https://telegra.ph/file/39fe38c27e274b51a8d80.jpg",
  "https://telegra.ph/file/3e7c35fb9f26ad4caf059.jpg",
  "https://telegra.ph/file/42a2abc9231793769314d.jpg",
  "https://telegra.ph/file/93ce93d82012639ae100f.jpg",
  "https://telegra.ph/file/e6ec49cb1e99033abbe94.jpg",
  "https://telegra.ph/file/fb28f1dfc751f93cff4df.jpg",
  "https://telegra.ph/file/ad756323dafdcf8b01f17.jpg",
  "https://telegra.ph/file/9cd0b1ff3fda17ce21fad.jpg",
  "https://telegra.ph/file/747256403524dc2ee483b.jpg",
  "https://telegra.ph/file/f0ebdee89d038eddc0e8b.jpg",
  "https://telegra.ph/file/74f78db8f73c06a3a40d2.jpg",
  "https://telegra.ph/file/c843b7693711f55ec7a0d.jpg",
  "https://telegra.ph/file/728861ebffaa2dbd8c9e1.jpg",
  "https://telegra.ph/file/30a2fdbaf86b147cf1767.jpg",
  "https://telegra.ph/file/358829b54106e5f4a930f.jpg",
  "https://telegra.ph/file/5b2b901bb065a120a05e7.jpg",
  "https://telegra.ph/file/ee38123afd0f29a516270.jpg",
  "https://telegra.ph/file/0068331257d1a994a166b.jpg",
  "https://telegra.ph/file/fd793b5c0995a6919e59f.jpg",
  "https://telegra.ph/file/99c1cdbed9f05d4f340f5.jpg",
  "https://telegra.ph/file/c785e69a706824d6c0513.jpg",
  "https://telegra.ph/file/1bed23dfa30f035dbf420.jpg",
  "https://telegra.ph/file/2ed075e159153d91c4e3b.jpg",
  "https://telegra.ph/file/5a58cb0d01f2078fc3a39.jpg",
  "https://telegra.ph/file/f204922e9a816cf337325.jpg",
  "https://telegra.ph/file/4d3ade4b749ce8382c08e.jpg",
  "https://telegra.ph/file/ab3f5802f8957581732ec.jpg",
  "https://telegra.ph/file/668f6be22c08fbef1531e.jpg",
  "https://telegra.ph/file/6f88669dc80e764335bdb.jpg",
  "https://telegra.ph/file/6cecb83f732e9be1ecdbe.jpg",
  "https://telegra.ph/file/f359be1bbdedfb15631d9.jpg",
  "https://telegra.ph/file/915d2f806270d6868d4b4.jpg",
  "https://telegra.ph/file/5632ee0809bf823cc43f4.jpg",
  "https://telegra.ph/file/3bf99ea9dd3c0ab0878fa.jpg",
  "https://telegra.ph/file/3da257351fed9aecb81fa.jpg",
  "https://telegra.ph/file/6b035fb5d3d9b6f1bbdc3.jpg",
  "https://telegra.ph/file/f6756c53ef9b7765468de.jpg",
  "https://telegra.ph/file/5e5efb863d754e159c8ea.jpg",
  "https://telegra.ph/file/3a3c3ce977045633b2f94.jpg",
  "https://telegra.ph/file/8c62487e875fa56d749a9.jpg",
  "https://telegra.ph/file/54abcedbf4c999259073b.jpg",
  "https://telegra.ph/file/68ab993da8de1a13afa72.jpg",
  "https://telegra.ph/file/dd532557f2c6f2ed29304.jpg",
  "https://telegra.ph/file/6a4f000539e329707ce5a.jpg",
  "https://telegra.ph/file/816c7f2188687918d9358.jpg",
  "https://telegra.ph/file/e52e878cf934c87fde167.jpg",
  "https://telegra.ph/file/4fd871f8176ceea3d87b9.jpg",
  "https://telegra.ph/file/aea04b4d15ab365dfaeca.jpg",
  "https://telegra.ph/file/1c66410df841aa91e15e8.jpg",
  "https://telegra.ph/file/7cf63763db54503830e67.jpg",
  "https://telegra.ph/file/0f34002d4f89fefa5fd1a.jpg",
  "https://telegra.ph/file/f1d45df5467a7a236dd7f.jpg",
  "https://telegra.ph/file/dabfc0a4c0650e190f9d6.jpg",
  "https://telegra.ph/file/abb681f36600dc4c8ae55.jpg",
  "https://telegra.ph/file/d7f69c49e471742b36d46.jpg",
  "https://telegra.ph/file/b83f4fdf0840df799d41e.jpg",
  "https://telegra.ph/file/a40354876d06d02eb675e.jpg",
  "https://telegra.ph/file/1a9103e9a4601ba75872d.jpg",
  "https://telegra.ph/file/bb6313ec8a722cd4e8d6d.jpg",
  "https://telegra.ph/file/46a58ab25b2c30c4f3be8.jpg",
  "https://telegra.ph/file/c2e6b400afba345210174.jpg",
  "https://telegra.ph/file/134d5fb1f6b0e79dee70d.jpg",
  "https://telegra.ph/file/e0ef145f7f998803be611.jpg",
  "https://telegra.ph/file/e0ef145f7f998803be611.jpg",
  "https://telegra.ph/file/58f934d6796b31ba44a14.jpg",
  "https://telegra.ph/file/f7d467aa76fea800225be.jpg",
  "https://telegra.ph/file/f6d4b396f7b05fc256f51.jpg",
  "https://telegra.ph/file/d07bba435e2861c7f2e2d.jpg",
  "https://telegra.ph/file/9a3473e46f05ed7742f64.jpg",
  "https://telegra.ph/file/4de4531fe32ce1849444b.jpg",
  "https://telegra.ph/file/0982afea5ce99cc048b0f.jpg",
  "https://telegra.ph/file/29b8ef6df668b940feabd.jpg",
  "https://telegra.ph/file/e78fe13bb9c213e199b14.jpg",
  "https://telegra.ph/file/d72ad66fc9d1d903bf0fc.jpg",
  "https://telegra.ph/file/6c0d60e8dd56900f113df.jpg",
  "https://telegra.ph/file/359824b505e7ef58bc66c.jpg",
  "https://telegra.ph/file/05256c8df54de45114512.jpg",
  "https://telegra.ph/file/358d08b2ded883765bd05.jpg",
  "https://telegra.ph/file/ec9785a29a4c7dbbfabad.jpg",
  "https://telegra.ph/file/144469f7e42de9b333cf5.jpg",
  "https://telegra.ph/file/9cad45960bb83b3b0b21b.jpg",
  "https://telegra.ph/file/1749f65a68412e2f83b81.jpg",
  "https://telegra.ph/file/1f41b70f0a7e101bd1d6b.jpg",
  "https://telegra.ph/file/e95591a908fc85eadc10b.jpg",
  "https://telegra.ph/file/baa9c7e42b81d6cbd3252.jpg",
  "https://telegra.ph/file/29569376493cf80c7e880.jpg",
  "https://telegra.ph/file/7020f835ec3b62a16fd0e.jpg",
  "https://telegra.ph/file/33340f6c88525394e77db.jpg",
  "https://telegra.ph/file/e3f9b6ef378cc790f979e.jpg",
  "https://telegra.ph/file/425b13df80e759daa53fd.jpg",
  "https://telegra.ph/file/5324ff61a1cfe206d36f8.jpg",
  "https://telegra.ph/file/3e28b51e7cd2011958b43.jpg",
  "https://telegra.ph/file/6a9156cabf98bf68c32d5.jpg",
  "https://telegra.ph/file/0c00f921fdef4798d05e7.jpg",
  "https://telegra.ph/file/44cc1ccef0be8e670e345.jpg",
  "https://telegra.ph/file/3e2704d80511f6c880c59.jpg",
  "https://telegra.ph/file/68a5f347a88ddfab477f5.jpg",
  "https://telegra.ph/file/cb9b9d00f574157fc5b64.jpg",
  "https://telegra.ph/file/8a4346dbb0355f98d779a.jpg",
  "https://telegra.ph/file/8c4678869911641fe6e07.jpg",
  "https://telegra.ph/file/2a81b713be4edda316560.jpg",
  "https://telegra.ph/file/4b32bfbbe482b1a89116c.jpg",
  "https://telegra.ph/file/42966164a143e22e703b9.jpg",
  "https://telegra.ph/file/041d45eb0891ee28b4650.jpg",
  "https://telegra.ph/file/331f2824a178ea2906ff0.jpg",
  "https://telegra.ph/file/07953904609669c71c767.jpg",
  "https://telegra.ph/file/17ec498132a370a864cd5.jpg",
  "https://telegra.ph/file/a430fc41b6be76ba69524.jpg",
  "https://telegra.ph/file/ec2db87ea21cb7c5e6440.jpg",
  "https://telegra.ph/file/d8989987ccb2abb692288.jpg",
  "https://telegra.ph/file/ace60f5d70bed24061e1f.jpg",
  "https://telegra.ph/file/bb0ce324de25e661e0661.jpg",
  "https://telegra.ph/file/38f4168917bd5a3c5b5da.jpg",
  "https://telegra.ph/file/ea0291e10e44738ee4bde.jpg",
  "https://telegra.ph/file/16da8646f40343eb78729.jpg",
  "https://telegra.ph/file/c6e58be9de1224d81e2ab.jpg",
  "https://telegra.ph/file/67aae12933d3148cebac8.jpg",
  "https://telegra.ph/file/5f6266ba6cf557c859ba2.jpg",
  "https://telegra.ph/file/6fdd68caaeeb8c28ef510.jpg",
  "https://telegra.ph/file/42b8f441215b9dbdeae3a.jpg",
  "https://telegra.ph/file/31dfe0f08d68f84b8263b.jpg",
  "https://telegra.ph/file/2189e5bedbdd6e25aa508.jpg",
  "https://telegra.ph/file/38c7afe7598c1349106d1.jpg",
  "https://telegra.ph/file/a2ce919e8c87f28090193.jpg",
  "https://telegra.ph/file/ea3ea88b83539d1cd8bd5.jpg",
  "https://telegra.ph/file/29468336a1e1509154217.jpg",
  "https://telegra.ph/file/8c85216f836b23370a288.jpg",
  "https://telegra.ph/file/c4704e7576d3cac960ea2.jpg",
  "https://telegra.ph/file/4efa6e6c5e65ee5f4d7fa.jpg",
  "https://telegra.ph/file/22dd7dc03a39cac305ae0.jpg",
  "https://telegra.ph/file/6294676580d1146ce18b7.jpg",
  "https://telegra.ph/file/a14efa0ca73c9509f1a28.jpg",
  "https://telegra.ph/file/f6ac5fed18fdf80f8d695.jpg",
  "https://telegra.ph/file/9fcb5d32dfefa69fc6726.jpg",
  "https://telegra.ph/file/84840759dfbd5e8f4d9f6.jpg",
  "https://telegra.ph/file/84840759dfbd5e8f4d9f6.jpg",
  "https://telegra.ph/file/ffa8fecba72c3a6198e9b.jpg",
  "https://telegra.ph/file/003f7c8bb9ff7c4b0cf93.jpg",
  "https://telegra.ph/file/3b4381aee62de5b05569b.jpg",
  "https://telegra.ph/file/eb08575cc5a9c214c35b6.jpg",
  "https://telegra.ph/file/c3724d598bcb1f48c38af.jpg",
  "https://telegra.ph/file/85f57ad768643edc322d6.jpg",
  "https://telegra.ph/file/66606790e4323cad289b4.jpg",
  "https://telegra.ph/file/b58a4ef9b51dec5fe61ed.jpg",
  "https://telegra.ph/file/8c91d31a964569fb85a35.jpg",
  "https://telegra.ph/file/f372a59f2e9bf7ecca9d3.jpg",
  "https://telegra.ph/file/d159e5fd54d0d68e2bc71.jpg",
  "https://telegra.ph/file/ab8afcf4a9251e3924cec.jpg",
  "https://telegra.ph/file/5014c0ceb5e1fd219f8fd.jpg",
  "https://telegra.ph/file/92077054c0b4810aa116c.jpg",
  "https://telegra.ph/file/8a927bfc80eebfca8d812.jpg",
  "https://telegra.ph/file/90f81b08a432adea1721b.jpg",
  "https://telegra.ph/file/810978c63e651de4e4418.jpg",
  "https://telegra.ph/file/7916baec3a91106d991ba.jpg",
  "https://telegra.ph/file/fbd8300b5b9e79cbf7cd5.jpg",
  "https://telegra.ph/file/bda0591d610fb94b303e4.jpg",
  "https://telegra.ph/file/61895a4f54c61df7858d2.jpg",
  "https://telegra.ph/file/5264edf9e4d5e9c798cbe.jpg",
  "https://telegra.ph/file/24af3f8651b2858d02346.jpg",
  "https://konachan.com/sample/5cd6c58baa80681607bd5ae43071f6d2/Konachan.com%20-%20316669%20sample.jpg",
  "https://konachan.com/sample/09fbd31d111262526f98cdd691bc14e1/Konachan.com%20-%20316638%20sample.jpg",
  "https://konachan.com/sample/52730995ccd5136bb6c8524ab7363396/Konachan.com%20-%20316634%20sample.jpg",
  "https://konachan.com/sample/747b76bfb23f7903019da58fb09bea9b/Konachan.com%20-%20316633%20sample.jpg", "https://telegra.ph/file/88829931d6b734cb81d45.jpg",
  "https://telegra.ph/file/b2ca52345fb9d34dc00aa.jpg",
  "https://telegra.ph/file/eee3b383da06978bd3345.jpg",
  "https://telegra.ph/file/45ece02bf4344ca71db6f.jpg",
  "https://telegra.ph/file/e14feacfd7136947c1e6d.jpg",
  "https://telegra.ph/file/2ce5ced0147736a3b9141.jpg",
  "https://telegra.ph/file/d8e6dc5bd35d9962e5d79.jpg",
  "https://telegra.ph/file/3035c7afcff1c31364126.jpg",
  "https://telegra.ph/file/3186a44958c7c6cffe8fe.jpg",
  "https://telegra.ph/file/c5ceb6d2fbe9469d8dcfa.jpg",
  "https://telegra.ph/file/e3bdd2133ae309153d30d.jpg",
  "https://telegra.ph/file/338b5c9326a58f54a0376.jpg",
  "https://telegra.ph/file/6a23c79320850610e6467.jpg",
  "https://telegra.ph/file/ed1dad55862b49814aad6.jpg",
  "https://telegra.ph/file/26533c164e74dbd205a78.jpg",
  "https://telegra.ph/file/dc0671a46564d290193ea.jpg",
  "https://telegra.ph/file/a7d6a8dd2e7678c141f6a.jpg",
  "https://telegra.ph/file/3fc8fa6d3de8fa9869176.jpg",
  "https://telegra.ph/file/fb645704d964ccce7a72b.jpg",
  "https://telegra.ph/file/11ed414134a123d481b66.jpg",
  "https://telegra.ph/file/a0ade65089a31b34691c9.jpg",
  "https://telegra.ph/file/d05832e9459dc2a537239.jpg",
  "https://telegra.ph/file/a2b61853686ece8432708.jpg",
  "https://telegra.ph/file/eb50eef12a3c2a7ac1269.jpg",
  "https://telegra.ph/file/d7022f5d84d5748be086b.jpg",
  "https://telegra.ph/file/982e1de100688272f659c.jpg",
  "https://telegra.ph/file/a28bc11dcfc6606bf0d41.jpg",
  "https://telegra.ph/file/1e341b6385bc057a193b9.jpg",
  "https://telegra.ph/file/ebc1fd0c76eaf43d33c1d.jpg",
  "https://telegra.ph/file/eb0bce54a1fba5dcf8b5c.jpg",
  "https://telegra.ph/file/2649e84022c1630d3a8a3.jpg",
  "https://telegra.ph/file/cac6a3fe968e89516ef2b.jpg",
  "https://telegra.ph/file/f6bc1007c9dea3badfe07.jpg",
  "https://telegra.ph/file/f5c231de6346c41b30058.jpg",
  "https://telegra.ph/file/32aac9ccdbac94101fba2.jpg",
  "https://telegra.ph/file/e65d4de5c21eb5d91d5c2.jpg",
  "https://telegra.ph/file/f7def87181c244e41998e.jpg",
  "https://telegra.ph/file/7f7106be2ece17b995855.jpg",
  "https://telegra.ph/file/1ff39feef5e2e8738e01d.jpg",
  "https://telegra.ph/file/7b3b11b605c61700e2845.jpg",
  "https://telegra.ph/file/50c5295f17d5e9c68670c.jpg",
  "https://telegra.ph/file/6e1bfca62c1e135897c77.jpg",
  "https://telegra.ph/file/f906dfd64cef28c50ec26.jpg",
  "https://telegra.ph/file/5bda31320f8274d73dd52.jpg",
  "https://telegra.ph/file/d3d67c9747e5d2b288273.jpg",
  "https://telegra.ph/file/75d198d07198e70b2595c.jpg",
  "https://telegra.ph/file/600c114827e99f3e781d8.jpg",
  "https://telegra.ph/file/af01c8b082876e6aba089.jpg",
  "https://telegra.ph/file/378b7027d2dc713ed67c9.jpg",
  "https://telegra.ph/file/ed11f2f875516e4f6a157.jpg",
  "https://telegra.ph/file/0339aeba2e4d52c6d1b45.jpg",
  "https://telegra.ph/file/2a845534ec27f45d0619c.jpg",
  "https://telegra.ph/file/73d8ae743adac5798cc5d.jpg",
  "https://telegra.ph/file/b11c231be42b609a06fcb.jpg",
  "https://telegra.ph/file/1d0e8665611e413a57d59.jpg",
  "https://telegra.ph/file/7ff9030454b3ceff201e0.jpg",
  "https://telegra.ph/file/a5b91614daf9c8940b60a.jpg",
  "https://telegra.ph/file/adda1676c3d746c6176e7.jpg",
  "https://telegra.ph/file/d5a1fc547b388fe8a5cda.jpg",
  "https://telegra.ph/file/bb5976ba2f49dbedc3296.jpg",
  "https://telegra.ph/file/8131d82246a8b930f1624.jpg",
  "https://telegra.ph/file/941bf542bf9e73bb8f64c.jpg",
  "https://telegra.ph/file/c3760a70a3fa849849df8.jpg",
  "https://telegra.ph/file/4ffc866dd7a5266c65f59.jpg",
  "https://telegra.ph/file/f036aa075a5a914116c04.jpg",
  "https://telegra.ph/file/4182df4e660bd913162ee.jpg",
  "https://telegra.ph/file/5991177a0c0136b24a3bd.jpg",
  "https://telegra.ph/file/ea91be45b35cc2590b86e.jpg",
  "https://telegra.ph/file/e8cde3ed8b8a2ccac4c1e.jpg",
  "https://telegra.ph/file/a4d2d3fde35611b6724b2.jpg",
  "https://telegra.ph/file/e873fafce9b4ad9a07762.jpg",
  "https://telegra.ph/file/7785ae6c16b7b10b69b1e.jpg",
  "https://telegra.ph/file/bd4675bac2e5687311d9f.jpg",
  "https://telegra.ph/file/b666ad6f2c2782401a398.jpg",
  "https://telegra.ph/file/171df1752bfdbf21c0afa.jpg",
  "https://telegra.ph/file/5a467eff59f802796b61b.jpg",
  "https://telegra.ph/file/692f31a2dddfcaf343e79.jpg",
  "https://telegra.ph/file/c7fa605099fdfdc169f05.jpg",
  "https://telegra.ph/file/91963c6e8fd599c459509.jpg",
  "https://telegra.ph/file/a8cd0e2629a9ba4f000cb.jpg",
  "https://telegra.ph/file/32e127cf5ffe47cea6d0c.jpg",
  "https://telegra.ph/file/4687ae2d21d4b7d3871fb.jpg",
  "https://telegra.ph/file/018f2b1a96a6fcc029782.jpg",
  "https://telegra.ph/file/6630ca810bd36da7a0965.jpg",
  "https://telegra.ph/file/378de420b0366cf5442be.jpg",
  "https://telegra.ph/file/7270d6694ea0200371908.jpg",
  "https://telegra.ph/file/4daeab021077900c10f39.jpg",
  "https://telegra.ph/file/4daeab021077900c10f39.jpg",
  "https://telegra.ph/file/79d92ee21e160afed4bd9.jpg",
  "https://telegra.ph/file/fb543ce26f8066428912a.jpg",
  "https://telegra.ph/file/8b91291ed241c2f178823.jpg",
  "https://telegra.ph/file/407975b9fc2c75ecd3a5b.jpg",
  "https://telegra.ph/file/407975b9fc2c75ecd3a5b.jpg",
  "https://telegra.ph/file/44f446888afc4f8f1b2e6.jpg",
  "https://telegra.ph/file/1ace591e9fa6416918ec4.jpg",
  "https://telegra.ph/file/e175a573795e814a3bbe1.jpg",
  "https://telegra.ph/file/ade39c27dc2b936a42a3f.jpg",
  "https://telegra.ph/file/1817dc50e3dab8191b6e0.jpg",
  "https://telegra.ph/file/e2dc69816512d22541163.jpg",
  "https://telegra.ph/file/0ba5060b87241d285f016.jpg",
  "https://telegra.ph/file/e523ef433f8f470ee4c8c.jpg",
  "https://telegra.ph/file/beef3e615e8ba6d25c5a8.jpg",
  "https://telegra.ph/file/beef3e615e8ba6d25c5a8.jpg",
  "https://telegra.ph/file/4fa9e69e49a348768ce63.jpg",
  "https://telegra.ph/file/fff458bc3f7ab23e0794d.jpg",
  "https://telegra.ph/file/e2e95c3e6ce446e0ef5f9.jpg",
  "https://telegra.ph/file/6bbfa1f8128df31404a45.jpg",
  "https://telegra.ph/file/8eb2a37f3ab965b9d297e.jpg",
  "https://telegra.ph/file/1464a185c57923dc7dacc.jpg",
  "https://telegra.ph/file/1464a185c57923dc7dacc.jpg",
  "https://telegra.ph/file/5fa10072694756a0167cd.jpg",
  "https://telegra.ph/file/d60646606b6bd3277acaf.jpg",
  "https://telegra.ph/file/f04d19f6d150d5213a852.jpg",
  "https://telegra.ph/file/a186b51ee41d48d112c4a.jpg",
  "https://telegra.ph/file/068fc17a6377f330be07b.jpg",
  "https://telegra.ph/file/81a03b4827e8b16ea33cf.jpg",
  "https://telegra.ph/file/23c245214ce3a523d1c32.jpg",
  "https://telegra.ph/file/bde7acdb844f3b06fc094.jpg",
  "https://telegra.ph/file/d237f1315992f621df77c.jpg",
  "https://telegra.ph/file/a2c7b704eef9aacadb745.jpg",
  "https://telegra.ph/file/6b2cbaedd92799e4676d6.jpg",
  "https://telegra.ph/file/fc067b832d4b4b063a286.jpg",
  "https://telegra.ph/file/e556a1c0bcc0a6c51e37f.jpg",
  "https://telegra.ph/file/000e50bcb5b41165cdb96.jpg",
  "https://telegra.ph/file/cc2cdfe1eb22ae42fb0be.jpg",
  "https://telegra.ph/file/c919b43aae3f40d03af74.jpg",
  "https://telegra.ph/file/dbde9d67aaadc87c41858.jpg",
  "https://telegra.ph/file/e4378f4e4de4245797092.jpg",
  "https://telegra.ph/file/e4378f4e4de4245797092.jpg",
  "https://telegra.ph/file/6c05a1a5e2f301aa255b8.jpg",
  "https://telegra.ph/file/d3f04ff261d710512073d.jpg",
  "https://telegra.ph/file/83faa9f99326e88a0eca2.jpg",
  "https://telegra.ph/file/a0248b7bf5c191cdda467.jpg",
  "https://telegra.ph/file/f66d1bf6ab594676e3c11.jpg",
  "https://telegra.ph/file/d96b37b1bfcd7ae938ff3.jpg",
  "https://telegra.ph/file/cb21089381c2f25afabb5.jpg",
  "https://telegra.ph/file/bc5ad85127fcb62edf9f0.jpg",
  "https://telegra.ph/file/0d027bcb8e5b7344d1179.jpg",
  "https://telegra.ph/file/686e4c0eb60bdf7fd6947.jpg",
  "https://telegra.ph/file/bd5bb75a0d56040167a2d.jpg",
  "https://telegra.ph/file/cb8ae49fea7a630e218b7.jpg",
  "https://telegra.ph/file/8f3478731d4a4d530b43b.jpg",
  "https://telegra.ph/file/f3d209d3b7616937c7506.jpg",
  "https://telegra.ph/file/eec0dc09be4d75c2ef9b9.jpg",
  "https://telegra.ph/file/0b0e98d659ecef96dd821.jpg",
  "https://telegra.ph/file/03252ba0c87b8b6661be9.jpg",
  "https://telegra.ph/file/f4b7db854c49ed0ffcdd9.jpg",
  "https://telegra.ph/file/188c0b9bd7355e08e82c5.jpg",
  "https://telegra.ph/file/02a22141e48505ae1ae23.jpg",
  "https://telegra.ph/file/5e5f1e3c1fed077b09932.jpg",
  "https://telegra.ph/file/644c4d9070a173a8e0b7d.jpg",
  "https://telegra.ph/file/d7b98dafa3927ab2a74bd.jpg",
  "https://telegra.ph/file/18be5033d5f31ec542490.jpg",
  "https://telegra.ph/file/5795ed77188c35204d2e9.jpg",
  "https://telegra.ph/file/d73ef8d212f5dcffe7965.jpg",
  "https://telegra.ph/file/f742286d1be45811565e4.jpg",
  "https://telegra.ph/file/18f8f38de6a2708dae803.jpg",
  "https://telegra.ph/file/60c408d92c1c6dbf950fb.jpg",
  "https://telegra.ph/file/37b71c25c009819a6c25f.jpg",
  "https://telegra.ph/file/a3a9a114e699110e03b41.jpg",
  "https://telegra.ph/file/618e7f04d15e5cb53a492.jpg",
  "https://telegra.ph/file/14e934bc836340f0e051d.jpg",
  "https://telegra.ph/file/6982db40c75cdf270dbd2.jpg",
  "https://telegra.ph/file/21a84c21366bfa6b2699f.jpg",
  "https://telegra.ph/file/a9aaa979eed53a0fea4e9.jpg",
  "https://telegra.ph/file/acb69ad6677ed80c8fd11.jpg",
  "https://telegra.ph/file/5637fef6262131c3cb05a.jpg",
  "https://telegra.ph/file/e63be610961172732aae6.jpg",
  "https://konachan.com/sample/f42af31763ede31e6ed3a5e2b40436e9/Konachan.com%20-%20316632%20sample.jpg",
  "https://konachan.com/sample/b069dbe72d0b4c459ff4ba4aa754f213/Konachan.com%20-%20316618%20sample.jpg",
  "https://konachan.com/sample/0f76bc626106913a8082450826a63a94/Konachan.com%20-%20316609%20sample.jpg",
  "https://konachan.com/sample/3a01a6e8a99193e777cfe76663707f67/Konachan.com%20-%20316606%20sample.jpg",
  "https://konachan.com/sample/143c3a759456379a818b87c4deb22b44/Konachan.com%20-%20316604%20sample.jpg",
  "https://konachan.com/sample/2c98a66d2999c0b3e3febc2fadb73263/Konachan.com%20-%20316587%20sample.jpg",
  "https://konachan.com/image/acd0838908ceb16928c02c52819f3c1a/Konachan.com%20-%20316588%20anthropomorphism%20anus%20ass%20aহ্যাঁnami_%28azur_lane%29%20azur_lane%20brown_eyes%20cropped%20dark%20gray_hair%20ponytail%20pussy%20rodriguez_%28kamwing%29%20skirt%20uncensored.jpg",
  "https://konachan.com/jpeg/07f957a15776d3a2b62f66fd26035e35/Konachan.com%20-%20316583%20anthropomorphism%20ass%20brown_hair%20etsunami_kumita%20gun%20headband%20kantai_collection%20long_hair%20mechagirl%20panties%20transparent%20underwear%20weapon%20wink.jpg",
  "https://konachan.com/sample/a5dd5a7a56b957a0491d4c518d4a3b1a/Konachan.com%20-%20316544%20sample.jpg",
  "https://konachan.com/sample/efc2db82a388ecaed8e3214ec2fcf065/Konachan.com%20-%20316542%20sample.jpg",
  "https://konachan.com/sample/96a183940796ce317b45ed57d786a13a/Konachan.com%20-%20316533%20sample.jpg",
  "https://konachan.com/sample/497b4caea912c0868a6de407a65c641c/Konachan.com%20-%20316520%20sample.jpg",
  "https://konachan.com/sample/b2067db7f9abf73c0e16e13dce67d0d4/Konachan.com%20-%20316504%20sample.jpg",
  "https://konachan.com/sample/9e6e9ca1debb5e67f9d6274b53d66532/Konachan.com%20-%20316458%20sample.jpg",
  "https://konachan.com/sample/79580dfece36d208c76d55fe22ca21ec/Konachan.com%20-%20316451%20sample.jpg",
  "https://konachan.com/sample/a8c586e7b3f863f618e0d2e40a6737ca/Konachan.com%20-%20316426%20sample.jpg",
  "https://konachan.com/sample/daa405a61c6a932bdc277eef0408ebc9/Konachan.com%20-%20316419%20sample.jpg",
  "https://konachan.com/sample/d040e4bd54a8c20081f4688608e7f39e/Konachan.com%20-%20316393%20sample.jpg",
  "https://konachan.com/sample/9ba81775f516614ad9def6417be655cb/Konachan.com%20-%20316369%20sample.jpg",
  "https://konachan.com/sample/08b6ee4c4c1e20199440c12548455b8f/Konachan.com%20-%20316332%20sample.jpg",
  "https://konachan.com/sample/f3f6ea463f111501fc8cc2b9b51e5c46/Konachan.com%20-%20316327%20sample.jpg",
  "https://konachan.com/sample/2897b42d557af1972c6dba4e48c3d3a0/Konachan.com%20-%20316311%20sample.jpg",
  "https://konachan.com/sample/d3c7f65c3ba1deda7c12d02982661994/Konachan.com%20-%20316300%20sample.jpg",
  "https://konachan.com/sample/8024a9645ca1f617e47a5517a9877be4/Konachan.com%20-%20316199%20sample.jpg",
  "https://konachan.com/sample/737a707688c52fdfdd74797e76d67ee2/Konachan.com%20-%20316192%20sample.jpg",
  "https://konachan.com/sample/ceb60e71af03f2a43958ef254619c537/Konachan.com%20-%20316191%20sample.jpg",
  "https://konachan.com/sample/99c4d8b8972dc3c2bf9c7ea2788a8fdc/Konachan.com%20-%20316189%20sample.jpg",
  "https://konachan.com/jpeg/60c4f47203e1b09a085058c7fb12c9b6/Konachan.com%20-%20316185%20ass%20blush%20braids%20kanojo_okarishimasu%20miazi%20panties%20purple_eyes%20red_hair%20sirasawa_sumi%20school_uniform%20skirt%20thighhighs%20underwear%20waifu2x.jpg",
  "https://konachan.com/jpeg/a0863dacd6d8ad422e50aeb423d80111/Konachan.com%20-%20316184%20anus%20ass%20blush%20braids%20censored%20kanojo_okarishimasu%20miazi%20nopan%20purple_eyes%20pussy%20red_hair%20sirasawa_sumi%20school_uniform%20skirt%20thighhighs%20waifu2x%20wet.jpg",
  "https://konachan.com/sample/47d6969795731490979501abb28176b2/Konachan.com%20-%20316173%20sample.jpg",
  "https://konachan.com/sample/09db6cfe17cb284dd18a06b2ede6632e/Konachan.com%20-%20316126%20sample.jpg",
  "https://konachan.com/sample/9300481457d1856a38433de5716d9c89/Konachan.com%20-%20316108%20sample.jpg",
  "https://konachan.com/sample/0bba0d6536375fe5565b7ac51ed7db88/Konachan.com%20-%20316089%20sample.jpg",
  "https://konachan.com/sample/dcaf0a2ad0b79ff1717a18359ec44996/Konachan.com%20-%20316088%20sample.jpg",
  "https://konachan.com/sample/24dd2b888c41ee50381c826de335705b/Konachan.com%20-%20316011%20sample.jpg",
  "https://konachan.com/sample/139b396b35f3dfcd24ee77952170b1b5/Konachan.com%20-%20316002%20sample.jpg",
  "https://konachan.com/sample/d274dae687e5755fa73dfe709de90b47/Konachan.com%20-%20316017%20sample.jpg",
  "https://konachan.com/sample/6b56f616636dee37b9cd7a3f4286bb9c/Konachan.com%20-%20316447%20sample.jpg",
  "https://konachan.com/sample/96f609d7d44c728efc56981706925b31/Konachan.com%20-%20315247%20sample.jpg",
  "https://konachan.com/sample/f9fa53d9c84cb91e888ffebbaadb60dd/Konachan.com%20-%20314894%20sample.jpg",
  "https://konachan.com/sample/6e240863e0243abfe6bb8d959464fa7c/Konachan.com%20-%20314481%20sample.jpg",
  "https://konachan.com/sample/72faaad5c52e32d951f30c92954bee2e/Konachan.com%20-%20314326%20sample.jpg",
  "https://konachan.com/sample/d85db565ce195e5fbc3fcc4045f80fe0/Konachan.com%20-%20313418%20sample.jpg", "https://konachan.com/sample/a616f14280c1c3e4c026fad4d6c32c55/Konachan.com%20-%20316710%20sample.jpg",
  "https://konachan.com/jpeg/3dfcf485e33fc56b503325ef23a78037/Konachan.com%20-%20316568%20aqua_eyes%20blonde_hair%20bondage%20braids%20cameltoe%20fang%20fate_grand_order%20fate_%28series%29%20flat_chest%20long_hair%20scarlettear33%20swimsuit%20tentacles.jpg",
  "https://konachan.com/sample/fd3336855eff4096c07b0ed3445d54e1/Konachan.com%20-%20316455%20sample.jpg",
  "https://konachan.com/sample/6b56f616636dee37b9cd7a3f4286bb9c/Konachan.com%20-%20316447%20sample.jpg",
  "https://konachan.com/sample/6d50fa9d193d2b7be8ea12f362b80c84/Konachan.com%20-%20315883%20sample.jpg",
  "https://konachan.com/sample/a92c3ad312ecc4fccf7f583e4849c1ae/Konachan.com%20-%20315884%20sample.jpg",
  "https://konachan.com/sample/346b73a9a6249b76b4d902c1e10e8f3a/Konachan.com%20-%20315828%20sample.jpg",
  "https://konachan.com/sample/647c499d8b46970042625601133a0d18/Konachan.com%20-%20315321%20sample.jpg",
  "https://konachan.com/sample/362725c208ad806b49e63f40561caeac/Konachan.com%20-%20315320%20sample.jpg",
  "https://konachan.com/sample/7e331d148a2b345d8891d4b2a9c5d7a0/Konachan.com%20-%20315248%20sample.jpg",
  "https://konachan.com/sample/96f609d7d44c728efc56981706925b31/Konachan.com%20-%20315247%20sample.jpg",
  "https://konachan.com/jpeg/0918ba4a839a54019d9134c9a53c387b/Konachan.com%20-%20315198%20anthropomorphism%20ass%20azur_lane%20bondage%20long_hair%20panties%20pantyhose%20red_hair%20see_through%20skirt%20skirt_lift%20twintails%20underwear%20yoshiheihe.jpg",
  "https://konachan.com/sample/f9fa53d9c84cb91e888ffebbaadb60dd/Konachan.com%20-%20314894%20sample.jpg",
  "https://konachan.com/sample/a5493092fa07fd55606e05b4bf98748a/Konachan.com%20-%20314756%20sample.jpg",
  "https://konachan.com/sample/bc2d55af82a86072330a918499be8788/Konachan.com%20-%20314542%20sample.jpg",
  "https://konachan.com/sample/6e240863e0243abfe6bb8d959464fa7c/Konachan.com%20-%20314481%20sample.jpg",
  "https://konachan.com/sample/72faaad5c52e32d951f30c92954bee2e/Konachan.com%20-%20314326%20sample.jpg",
  "https://konachan.com/sample/a2441778a6bafd4251936727b3bd4df3/Konachan.com%20-%20314069%20sample.jpg",
  "https://konachan.com/sample/266e384f3d043ab4a5e37c108a5a2bfd/Konachan.com%20-%20314065%20sample.jpg",
  "https://konachan.com/sample/caff5e7274a8141e95822913af15d9da/Konachan.com%20-%20314032%20sample.jpg",
  "https://konachan.com/sample/851c56b73b204a704410a44605d069aa/Konachan.com%20-%20313782%20sample.jpg",
  "https://konachan.com/jpeg/163ed4cbe0e542484733e18a953683ea/Konachan.com%20-%20313778%20aliasing%20arknights%20black_hair%20blush%20bodhi_wushushenghua%20bondage%20breasts%20chain%20cleavage%20eunectes_%28arknights%29%20flowers%20garter%20goggles%20tail.jpg",
  "https://konachan.com/sample/e94bc73cafb5d81656f0f54051a3676f/Konachan.com%20-%20313642%20sample.jpg",
  "https://konachan.com/sample/0fe74ca43f2ccdb1d2406f5dfcde1a1a/Konachan.com%20-%20313640%20sample.jpg",
  "https://konachan.com/sample/bef9b55682a955d13d373f3e6f179dcd/Konachan.com%20-%20313498%20sample.jpg",
  "https://konachan.com/sample/01db1ae10738b66923954534a30ffb52/Konachan.com%20-%20313423%20sample.jpg",
  "https://konachan.com/sample/d85db565ce195e5fbc3fcc4045f80fe0/Konachan.com%20-%20313418%20sample.jpg"
];

// You can replace the URL above later. Add more URLs by adding them to this array.
// The sender cycles through the configured URLs up to MAX_BULK (100).

const running = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkGroupAdmin(message) {
  try {
    if (!message.isGroup) {
      await message.send("❌ This command works only inside a group.");
      return false;
    }

    // Only the person who owns / has connected the bot can use this.
    // Group admin rights (for the sender OR the bot) are NOT required.
    if (!isOwnerMessage(message)) {
      await message.send("❌ Only the bot owner can use this command.");
      return false;
    }

    return true;
  } catch (error) {
    console.error("[bulk] permission error:", error);
    await message.send("❌ Failed to check group permissions.");
    return false;
  }
}

function parseCount(value) {
  const n = Number.parseInt(String(value || "").trim(), 10);

  if (!Number.isFinite(n) || n < 1) {
    return null;
  }

  return Math.min(n, MAX_BULK);
}

async function sendGroupLinks(message, count) {
  const key = String(message.from);

  if (running.has(key)) {
    return message.send(
      "⏳ A bulk send is already running in this group. Use `.stopbulk` first."
    );
  }

  const ok = await checkGroupAdmin(message);
  if (!ok) return;

  running.add(key);

  try {
    // If a link was saved with `setlink`, always use that link,
    // even when this command is executed from another group.
    let link = loadConfiguredGroupLink();

    // Backward-compatible fallback:
    // before a link is configured, use the current group's invite link.
    if (!link) {
      const code = await message.inviteCode();

      if (!code) {
        throw new Error("No invite code returned.");
      }

      link = `https://chat.whatsapp.com/${code}`;

      await message.send(
        "⚠️ No fixed group link is configured yet. Using this group's link.\n" +
        "Use `setlink` in your target/source group to save its link."
      );
    }

    await message.send(
      `🔗 Starting ${count} group-link messages.\n` +
      `🎯 Fixed link: ${link}\n` +
      `⏱️ Delay: ${DELAY_MS}ms\n` +
      `🛑 Stop: .stopbulk`
    );

    for (let i = 1; i <= count; i++) {
      if (!running.has(key)) break;

      await message.send(link);

      if (i < count) {
        await sleep(DELAY_MS);
      }
    }

    if (running.has(key)) {
      await message.send(`✅ Link bulk finished: ${count}/${count}`);
    } else {
      await message.send("🛑 Link bulk stopped.");
    }
  } catch (error) {
    console.error("[bulk] link error:", error);

    await message.send(
      `❌ Link bulk failed: ${error?.message || "unknown error"}`
    );
  } finally {
    running.delete(key);
  }
}

async function setGroupLink(message, match = "") {
  const ok = await checkGroupAdmin(message);
  if (!ok) return;

  try {
    // Remove accidental spaces around the URL.
    let link = String(match || "").trim();

    // `setlink` with no URL captures the current group's invite link.
    if (!link) {
      const code = await message.inviteCode();

      if (!code) {
        throw new Error("No invite code returned.");
      }

      link = `https://chat.whatsapp.com/${code}`;
    }

    /*
     * Accept both:
     *
     * https://chat.whatsapp.com/XXXXXXXX
     *
     * AND:
     *
     * https://chat.whatsapp.com/XXXXXXXX?s=cl&p=a&mlu=4&ilr=4
     *
     * WhatsApp may append query parameters to invite links.
     */
    const validWhatsAppGroupLink =
      /^https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+(?:\?[^\s]+)?$/i;

    if (!validWhatsAppGroupLink.test(link)) {
      return message.send(
        "❌ Invalid WhatsApp group link.\n\n" +
        "Use `setlink` inside the group whose link you want to save,\n" +
        "or `setlink https://chat.whatsapp.com/XXXXXXXX`."
      );
    }

    // Save the complete invite URL, including WhatsApp query parameters.
    saveConfiguredGroupLink(link);

    await message.send(
      "✅ Fixed group link saved successfully.\n\n" +
      `🔗 ${link}\n\n` +
      "अब किसी भी दूसरे group में `10 link` / `10 ntlink` लिखोगे,\n" +
      "तो यही saved link भेजा जाएगा."
    );
  } catch (error) {
    console.error("[bulk] set link error:", error);

    await message.send(
      `❌ Failed to save group link: ${error?.message || "unknown error"}`
    );
  }
}

async function downloadSticker(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: 15 * 1024 * 1024,
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const input = Buffer.from(res.data);

  // Convert normal images/GIFs to a WhatsApp-compatible
  // animated/static WebP.
  return sharp(input, { animated: true })
    .resize({
      width: 512,
      height: 512,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      effort: 3,
      quality: 82,
    })
    .toBuffer();
}

async function sendStickerBulk(message, count) {
  const key = String(message.from);

  if (running.has(key)) {
    return message.send(
      "⏳ A bulk send is already running in this group. Use `.stopbulk` first."
    );
  }

  const ok = await checkGroupAdmin(message);
  if (!ok) return;

  if (!STICKER_URLS.length) {
    return message.send(
      "❌ No sticker URLs configured.\n\n" +
      "Open `plugins/bulk-link-sticker.js` and add direct image/GIF URLs inside `STICKER_URLS`."
    );
  }

  running.add(key);

  try {
    await message.send(
      `🎞️ Starting ${count} sticker messages.\n` +
      `⏱️ Delay: ${DELAY_MS}ms\n` +
      `🛑 Stop: .stopbulk`
    );

    let sent = 0;

    for (let i = 0; i < count; i++) {
      if (!running.has(key)) break;

      const url = STICKER_URLS[i % STICKER_URLS.length];

      try {
        const sticker = await downloadSticker(url);

        await message.send({
          sticker,
        });

        sent++;
      } catch (error) {
        console.error(
          `[bulk] sticker ${i + 1} failed:`,
          error?.message || error
        );

        await message.send(
          `⚠️ Sticker ${i + 1} failed; continuing with the next URL.`
        );
      }

      if (i < count - 1) {
        await sleep(DELAY_MS);
      }
    }

    if (running.has(key)) {
      await message.send(
        `✅ Sticker bulk finished: ${sent}/${count}`
      );
    } else {
      await message.send(
        `🛑 Sticker bulk stopped: ${sent}/${count} sent.`
      );
    }
  } catch (error) {
    console.error("[bulk] sticker error:", error);

    await message.send(
      `❌ Sticker bulk failed: ${error?.message || "unknown error"}`
    );
  } finally {
    running.delete(key);
  }
}

/*
 * ============================================================
 * SET GROUP LINK - TEXT HANDLER
 * ============================================================
 *
 * Supports:
 *
 * setlink
 * setlink https://chat.whatsapp.com/XXXXXXXX
 * setlink https://chat.whatsapp.com/XXXXXXXX?s=cl&p=a&mlu=4&ilr=4
 *
 * IMPORTANT:
 * The regex uses \s, not \\s.
 * ============================================================
 */

Module({
  on: "text",
  name: "group-link-config",
  package: "group",
  description: "Set the fixed WhatsApp group link used by bulk link commands",
})(async (message) => {
  try {
    const body = String(message.body || "").trim();

    const match = body.match(
      /^set\s*link(?:\s+(.+))?$/i
    );

    if (match) {
      return setGroupLink(message, match[1] || "");
    }
  } catch (error) {
    console.error(
      "[bulk] setlink text handler error:",
      error
    );
  }
});

/*
 * ============================================================
 * NATURAL TEXT COMMANDS
 * ============================================================
 *
 * 10 link
 * 10 links
 * 10 ntlink
 * 10 sticker
 * 10 stickers
 * ============================================================
 */

Module({
  on: "text",
  name: "group-link-sticker-bulk",
  package: "group",
  description: "Admin-only bounded bulk group links or configured stickers",
})(async (message) => {
  try {
    const body = String(message.body || "").trim();

    let match = body.match(
      /^(\d{1,4})\s+links?$/i
    );

    if (match) {
      return sendGroupLinks(
        message,
        parseCount(match[1])
      );
    }

    // NT link spelling.
    match = body.match(
      /^(\d{1,4})\s+ntlink$/i
    );

    if (match) {
      return sendGroupLinks(
        message,
        parseCount(match[1])
      );
    }

    match = body.match(
      /^(\d{1,4})\s+stickers?$/i
    );

    if (match) {
      return sendStickerBulk(
        message,
        parseCount(match[1])
      );
    }
  } catch (error) {
    console.error(
      "[bulk] text handler error:",
      error
    );
  }
});

/*
 * ============================================================
 * EXPLICIT SETLINK COMMAND
 * ============================================================
 *
 * .setlink
 * .setlink https://chat.whatsapp.com/XXXXXXXX
 * ============================================================
 */

Module({
  command: "setlink",
  aliases: [
    "setgrouplink",
    "set-link",
  ],
  package: "group",
  description: "Save the fixed WhatsApp group link used by bulk link commands",
})(async (message, match) => {
  return setGroupLink(
    message,
    match
  );
});

/*
 * ============================================================
 * LINK BLAST
 * ============================================================
 */

Module({
  command: "linkblast",
  aliases: [
    "linkbulk",
    "ntlink",
  ],
  package: "group",
  description: "Send the saved group invite link up to 100 times",
})(async (message, match) => {
  const count = parseCount(match);

  if (!count) {
    return message.send(
      "Usage: `.linkblast 10` (max 100)"
    );
  }

  return sendGroupLinks(
    message,
    count
  );
});

/*
 * ============================================================
 * STICKER BLAST
 * ============================================================
 */

Module({
  command: "stickerblast",
  aliases: [
    "stickerbulk",
  ],
  package: "group",
  description: "Send configured sticker URLs up to 100 times",
})(async (message, match) => {
  const count = parseCount(match);

  if (!count) {
    return message.send(
      "Usage: `.stickerblast 10` (max 100)"
    );
  }

  return sendStickerBulk(
    message,
    count
  );
});

/*
 * ============================================================
 * STOP BULK
 * ============================================================
 */

Module({
  command: "stopbulk",
  aliases: [
    "stopblast",
  ],
  package: "group",
  description: "Stop the active bulk sender in this group",
})(async (message) => {
  const ok = await checkGroupAdmin(message);

  if (!ok) return;

  const key = String(message.from);

  if (!running.has(key)) {
    return message.send(
      "ℹ️ No bulk sender is running in this group."
    );
  }

  running.delete(key);

  return message.send(
    "🛑 Stop signal sent."
  );
});
