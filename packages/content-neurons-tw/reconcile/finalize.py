"""Finalize dataset: hardcode 106-1 subject blocks (user-confirmed), emit app-schema artifacts."""
import json, os, re
from reconcile_all import reconcile_year

# User-confirmed 106-1 contiguous subject blocks (old grouping)
OLD_106_1 = {
    '醫學一': [(1, 28, '解剖學'), (29, 32, '胚胎學'), (33, 41, '組織學'),
              (42, 74, '微生物暨免疫學'), (75, 82, '寄生蟲學'), (83, 100, '公共衛生學')],
    '醫學二': [(1, 25, '生理學'), (26, 50, '生物化學'), (51, 76, '藥理學'), (77, 100, '病理學')],
}


def subject_106_1(book, qn):
    for a, b, s in OLD_106_1[book]:
        if a <= qn <= b:
            return s
    return None


SUBJECT_COLOR = {
    '解剖學': '#c44d4d', '生物化學': '#6a8c3f', '生理學': '#6a9bc4', '胚胎學': '#d4a04d',
    '組織學': '#a06ac4', '藥理學': '#c46a8c', '微生物暨免疫學': '#4d8cc4', '病理學': '#8c5a3f',
    '公共衛生學': '#5fa57e', '寄生蟲學': '#7a8c4d',
}
SUBJECT_GROUP = {  # modern canonical grouping (subjects.json `group`)
    '解剖學': '醫學一', '生物化學': '醫學一', '生理學': '醫學一', '胚胎學': '醫學一', '組織學': '醫學一',
    '藥理學': '醫學二', '微生物暨免疫學': '醫學二', '病理學': '醫學二', '公共衛生學': '醫學二', '寄生蟲學': '醫學二',
}
SOURCE_CREDIT = '考選部（試題與標準答案）+ 陽明國考考古題小組（詳解，CC-BY-NC）'


def main():
    all_recs = []
    for year in range(106, 115):
        recs, _ = reconcile_year(year)
        for r in recs:
            if (r['year'], r['sess']) == (106, 1):
                r['subject'] = subject_106_1(r['book'], r['qNum'])
                r['subjectSource'] = 'manual-block'
            r['id'] = f"{r['year']}-{r['sess']}-{r['book']}-{r['subject']}-Q{r['qNum']}"
        all_recs.extend(recs)

    # emit app-schema questions.json
    out_q = []
    for r in all_recs:
        rec = {
            'id': r['id'], 'subject': r['subject'], 'stem': r['stem'], 'options': r['options'],
            'answer': r['answer'], 'explanation': r['explanation'],
            'hasImage': r['hasImage'], 'hasOptionImages': False,
            'meta': {'year': r['year'], 'session': r['sess'], 'book': r['book'],
                     'paper': 'medexam-1' if r['book'] == '醫學一' else 'medexam-2',
                     'qNumber': r['qNum']},
            'sourceCredit': SOURCE_CREDIT,
        }
        if r.get('acceptedAnswers'):
            rec['acceptedAnswers'] = r['acceptedAnswers']
        out_q.append(rec)

    # subjects.json
    counts = {}
    for r in all_recs:
        counts[r['subject']] = counts.get(r['subject'], 0) + 1
    order = ['解剖學', '生理學', '生物化學', '組織學', '胚胎學',
             '微生物暨免疫學', '病理學', '藥理學', '公共衛生學', '寄生蟲學']
    out_s = [{'id': s, 'displayName': s, 'group': SUBJECT_GROUP[s], 'color': SUBJECT_COLOR[s],
              'iconKey': f'subject:{s}', 'totalQuestions': counts.get(s, 0)}
             for s in order if s in counts]

    # meta.json
    out_m = {
        'id': 'medexam-tw', 'displayName': '台灣一階醫師國考', 'locale': 'zh-TW',
        'builtAt': '2026-05-30T00:00:00.000Z',
        'sourceCredit': SOURCE_CREDIT,
        'sourceUrl': 'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx',
        'license': 'CC-BY-NC-4.0',
        'stats': {'totalQuestions': len(out_q), 'papers': 36, 'subjects': len(out_s),
                  'withExplanation': sum(1 for q in out_q if q['explanation'].strip()),
                  'gapsFilled': sum(1 for q in out_q if not q['explanation'].strip()),
                  'corrections': sum(1 for q in out_q if 'acceptedAnswers' in q)},
    }

    os.makedirs('out/artifacts', exist_ok=True)
    json.dump(out_q, open('out/artifacts/questions.json', 'w'), ensure_ascii=False)
    json.dump(out_s, open('out/artifacts/subjects.json', 'w'), ensure_ascii=False, indent=2)
    json.dump(out_m, open('out/artifacts/meta.json', 'w'), ensure_ascii=False, indent=2)
    print(f"questions={len(out_q)}  subjects={len(out_s)}")
    print('subject counts:', {s: counts[s] for s in order if s in counts})
    print('meta.stats:', json.dumps(out_m['stats'], ensure_ascii=False))
    # sanity: 106-1 Q74 should now be 微免
    q74 = next(q for q in out_q if q['id'].startswith('106-1-') and q['meta']['qNumber'] == 74 and q['meta']['book'] == '醫學一')
    print('106-1 醫一 Q74 →', q74['id'], '|', q74['subject'])


if __name__ == '__main__':
    main()
