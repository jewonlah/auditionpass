import unittest
from utils.run_groups import select_group

class RunGroupsTest(unittest.TestCase):
    def test_each_source_runs_in_exactly_one_group(self):
        sources = [type(name, (), {})() for name in ['PlfilScraper','NaverCafeScraper','NaverWebScraper','NaverWebScraper','BacktraceScraper']]
        self.assertEqual(select_group(sources, 'all'), sources)
        partition = [s for group in ['core','cafe','web','backtrace'] for s in select_group(sources, group)]
        self.assertEqual(len(partition), len(sources))
        self.assertEqual({id(s) for s in partition}, {id(s) for s in sources})
        with self.assertRaises(ValueError): select_group(sources, 'typo')

if __name__ == '__main__': unittest.main()
