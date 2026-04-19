import json, gzip

additions = json.loads(gzip.open('./data/alternate_passive_additions.json.gz').read())
skills = json.loads(gzip.open('./data/alternate_passive_skills.json.gz').read())

result = {}
KEYSTONE = 4
for item in additions + skills:
    if KEYSTONE in item['PassiveType']:
        continue
    key = str(item['AlternateTreeVersionsKey'])
    if key not in result:
        result[key] = {}
    for sk in item['StatsKeys']:
        result[key][str(sk)] = sk

output = json.dumps(result, separators=(',', ':'))
with gzip.open('./data/possible_stats.json.gz', 'wt', encoding='utf-8') as f:
    f.write(output)
print('Done')