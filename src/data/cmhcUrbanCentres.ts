/**
 * CMHC Rental Market Survey urban centres ("Centre" column), population 10,000+.
 * Source: CMHC data table *Urban Rental Market Survey Data: Average Rents in Urban Centres* (October 2023 / 2024 survey).
 * Regenerate: download CMHC *Urban Rental Market Survey Data: Average Rents in Urban Centres* (xlsx), then
 * `python scripts/gen-cmhc-urban-centres.py path/to/workbook.xlsx` (see `scripts/gen-cmhc-urban-centres.py`).
 */

export const CMHC_URBAN_CENTRES_BY_PROVINCE: Record<string, readonly string[]> = {
  AB: ['Blackfalds T', 'Bonnyville No. 87 MD', 'Brooks', 'Calgary', 'Camrose', 'Canmore', 'Clearwater County MD', 'Cold Lake CY', 'Edmonton', 'Foothills County MD', 'Grande Prairie', 'Grande Prairie County No. 1 MD', 'High River', 'Lac Ste. Anne County MD', 'Lacombe', 'Lacombe County MD', 'Lethbridge', 'Lloydminster', 'Mackenzie County SM', 'Medicine Hat', 'Mountain View County MD', 'Okotoks', 'Red Deer', 'Red Deer County MD', 'Strathmore', 'Sylvan Lake', 'Wetaskiwin', 'Wetaskiwin County No. 10 MD', 'Wood Buffalo', 'Yellowhead County MD'] as const,
  BC: ['Abbotsford - Mission', 'Campbell River', 'Chilliwack', 'Courtenay', 'Cranbrook', 'Dawson Creek', 'Duncan', 'Fort St. John', 'Kamloops', 'Kelowna', 'Ladysmith', 'Nanaimo', 'Nelson', 'Parksville', 'Penticton', 'Port Alberni', 'Powell River', 'Prince George', 'Prince Rupert', 'Quesnel', 'Salmon Arm', 'Saltspring Island RDA', 'Sechelt DM', 'Squamish', 'Summerland DM', 'Terrace', 'Trail', 'Vancouver', 'Vernon', 'Victoria', 'Whistler DM', 'Williams Lake'] as const,
  MB: ['Brandon', 'Hanover RM', 'Portage la Prairie', 'Selkirk CY', 'St. Andrews RM', 'Steinbach', 'Thompson', 'Winkler', 'Winnipeg'] as const,
  NB: ['Bathurst', 'Campbellton', 'Edmundston', 'Fredericton', 'Miramichi', 'Moncton', 'Saint John', 'Tracadie MRM'] as const,
  NL: ['Corner Brook', 'Gander', 'Grand Falls-Windsor', 'St. John\'s'] as const,
  NS: ['Cape Breton', 'Chester MD', 'Halifax', 'Kentville', 'Kings, Subd. A SC', 'Lunenburg MD', 'New Glasgow', 'Queens RGM', 'Truro', 'West Hants RM', 'Yarmouth MD'] as const,
  NT: ['Yellowknife'] as const,
  ON: ['Barrie', 'Belleville - Quinte West', 'Bracebridge T', 'Brantford', 'Brighton MU', 'Brock TP', 'Brockville', 'Centre Wellington', 'Chatham-Kent', 'Cobourg', 'Collingwood', 'Cornwall', 'Elliot Lake', 'Erin T', 'Essa', 'Gravenhurst T', 'Greater Napanee T', 'Greater Sudbury (CV)', 'Grey Highlands MU', 'Guelph', 'Haldimand County CY', 'Hamilton', 'Hawkesbury', 'Huntsville T', 'Ingersoll', 'Kawartha Lakes', 'Kenora', 'Kincardine MU', 'Kingston', 'Kitchener - Cambridge - Waterloo', 'Lambton Shores MU', 'London', 'Meaford MU', 'Midland', 'Norfolk', 'North Bay', 'North Perth MU', 'Orillia', 'Oshawa', 'Ottawa', 'Owen Sound', 'Pembroke', 'Petawawa', 'Peterborough', 'Port Hope', 'Prince Edward County CY', 'Sarnia', 'Saugeen Shores T', 'Sault Ste. Marie', 'Scugog TP', 'South Dundas MU', 'South Huron MU', 'St. Catharines - Niagara', 'Stratford', 'The Nation (M)', 'Thunder Bay', 'Tillsonburg', 'Timmins', 'Toronto', 'Trent Hills MU', 'Wasaga Beach', 'West Grey MU', 'West Nipissing (M)', 'Windsor', 'Woodstock'] as const,
  PE: ['Charlottetown', 'Summerside'] as const,
  QC: ['Alma', 'Amos', 'Baie-Comeau', 'Campbellton', 'Cowansville', 'Dolbeau-Mistassini', 'Drummondville', 'Farnham V', 'Gaspé V', 'Gatineau', 'Granby', 'Hawkesbury', 'Joliette', 'La Tuque V', 'Lachute', 'Les Îles-de-la-Madeleine MÉ', 'Marieville V', 'Matane', 'Mont-Laurier V', 'Mont-Tremblant V', 'Montmagny V', 'Montréal', 'Pont-Rouge V', 'Prévost V', 'Québec', 'Rawdon MÉ', 'Rimouski', 'Rivière-du-Loup', 'Rouyn-Noranda', 'Saguenay', 'Saint-Félicien V', 'Saint-Georges', 'Saint-Hippolyte MÉ', 'Saint-Hyacinthe', 'Saint-Raymond V', 'Saint-Sauveur V', 'Sainte-Adèle V', 'Sainte-Agathe-des-Monts', 'Sainte-Julienne MÉ', 'Sainte-Marie', 'Sainte-Sophie MÉ', 'Salaberry-de-Valleyfield', 'Sept-Îles', 'Shawinigan', 'Sherbrooke', 'Sorel-Tracy', 'Thetford Mines', 'Trois-Rivières', 'Val-d\'Or', 'Victoriaville'] as const,
  SK: ['Estevan', 'Lloydminster', 'Moose Jaw', 'North Battleford', 'Prince Albert', 'Regina', 'Saskatoon', 'Swift Current', 'Weyburn', 'Yorkton'] as const,
  YT: ['Whitehorse'] as const,
} as const

