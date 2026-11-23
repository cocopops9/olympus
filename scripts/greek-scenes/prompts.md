# Workout calendar month scenes

Generated with Z-Image Turbo (Hugging Face space `mcp-tools/Z-Image-Turbo`), 1344 x 576 (21:9),
seed 7, 8 steps, shift 3. Every prompt is the scene below wrapped in the shared style:

> Ancient Greek black-figure vase painting frieze, wide panoramic scene: **SCENE**, black silhouette
> figures with fine incised lines on a flat warm terracotta orange background, thin black meander key
> border along top and bottom edges, flat 2D, museum amphora style, no text, no letters

| file | Attic month | scene |
|---|---|---|
| amphora | Hekatombaion | the Panathenaic procession, the goddess Athena with helmet, spear and round shield at the centre, athletes running a footrace and a chariot with horses, maidens carrying a folded robe (peplos) and amphorae of olive oil |
| lyre | Metageitnion | the god Apollo with a laurel wreath playing a lyre at the centre, surrounded by dancing Athenian men and women holding hands and musicians with double flutes at a festival (also "symmetrical composition") |
| wheat | Boedromion | the goddess Demeter crowned with wheat ears holding torches, with her daughter Persephone, a procession of initiates carrying sheaves of wheat and torches at night toward Eleusis |
| grapes | Pyanepsion | the grape harvest of Dionysus, the god Dionysus with ivy wreath holding a wine cup under grape vines, satyrs and youths picking grapes into baskets and treading grapes in a vat, a woman stirring a pot of beans |
| thunderbolt | Maimakterion | Zeus enthroned in the clouds hurling a thunderbolt, storm winds personified as winged figures blowing, rain and zigzag lightning, sailors and farmers sheltering |
| trident | Poseideon | the sea god Poseidon with beard and trident riding a chariot pulled by sea horses over stylised waves, dolphins leaping, nereids riding dolphins, a Greek trireme ship with oars |
| pomegranate | Gamelion | the sacred wedding of Zeus and Hera, the bearded king Zeus and the crowned queen Hera holding hands in the centre, Hera with a veil and a pomegranate, a peacock, wedding procession with women carrying torches and gifts, a youth playing the lyre |
| flower | Anthesterion | the Anthesteria spring festival of flowers, children and women wearing flower wreaths carrying garlands and small wine jugs, Dionysus on a ship-cart, blossoming branches and palmette flowers all around |
| bow | Elaphebolion | the huntress goddess Artemis in a short tunic drawing her bow, running with hunting dogs chasing leaping deer through a forest of stylised trees |
| moon | Mounichion | the goddess Artemis with a crescent moon on her head holding a torch at night, young girls dancing in a circle holding round moon cakes ringed with small candles, a harbour with Greek ships and stars in the sky |
| sun | Thargelion | the Thargelia harvest festival, the sun god Apollo with radiant crown and his twin sister Artemis receiving first fruits, farmers bringing baskets of the first harvest, loaves of bread and pots of grain, a boys' choir singing, the sun with rays above |
| owl | Skirophorion | the Skira procession, priests and a priestess of Athena walking under a large white parasol held over them, the goddess Athena with helmet and an owl perched on an olive tree, the Acropolis temple in the background |

`python3 scripts/greek-scenes/build.py` crops and compresses `src/*.webp` into
`frontend/src/assets/greek-months/`. A month whose file is missing shows its banner without a scene.
