import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Plus, TrendingUp, TrendingDown, Trash2, Star, Flame, Eye } from 'lucide-react';
import Swal from 'sweetalert2';
import { useTranslation } from 'next-i18next';
import { investmentAPI } from '@/utils/api';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cryptoAPI } from '@/utils/api';

interface Crypto {
  symbol: string;
  coin_name?: string;
  lastPrice?: string;
  priceChange?: string;
  priceChangePercent?: string;
}

interface CryptoWatchlistProps {
  showAdd: boolean;
  setShowAdd: (show: boolean) => void;
}

export function CryptoWatchlist({ showAdd, setShowAdd }: CryptoWatchlistProps) {
  const { t } = useTranslation('common');
  const [cryptos, setCryptos] = useState<Crypto[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [newCoinName, setNewCoinName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [allCoins, setAllCoins] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<any>(null);
  const [viewCoin, setViewCoin] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [coinDetail, setCoinDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch all coins from Binance
  useEffect(() => {
    async function fetchCoins() {
      const res = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
      setAllCoins(res.data.symbols.filter((s: any) => s.quoteAsset === 'USDT'));
    }
    fetchCoins();
  }, []);

  // Filter coins as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      const results = allCoins.filter(
        (c: any) =>
          c.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.baseAsset.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(results.slice(0, 10));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, allCoins]);

  // Example trending coins (replace with real sentiment API if desired)
  const trendingCoins = ['BTCUSDT', 'ETHUSDT', 'DOGEUSDT'];

  const fetchWatchlist = async () => {
    try {
      setLoading(true);
      const response = await investmentAPI.getCryptoWatchlist();
      setCryptos(response.data);
    } catch (err) {
      setError('Failed to load crypto watchlist');
      Swal.fire({ icon: 'error', title: t('Failed to load watchlist'), text: t('Please try again later.') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const handleAddCrypto = async () => {
    if (!newSymbol.trim()) {
      Swal.fire({ icon: 'error', title: t('Please enter a symbol'), text: t('Please fill in all fields.') });
      return;
    }
    try {
      setAdding(true);
      await investmentAPI.addToCryptoWatchlist(newSymbol.trim().toUpperCase(), newCoinName.trim());
      Swal.fire({ icon: 'success', title: t('Coin added to watchlist'), text: t('The coin has been successfully added to your watchlist.') });
      setNewSymbol('');
      setNewCoinName('');
      setShowAdd(false);
      fetchWatchlist();
    } catch (err) {
      Swal.fire({ icon: 'error', title: t('Failed to add coin'), text: t('Please try again.') });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveCrypto = async (symbol: string) => {
    try {
      await investmentAPI.removeFromCryptoWatchlist(symbol);
      Swal.fire({ icon: 'success', title: t('Coin removed from watchlist'), text: t('The coin has been successfully removed from your watchlist.') });
      fetchWatchlist();
    } catch (err) {
      Swal.fire({ icon: 'error', title: t('Failed to remove coin'), text: t('Please try again.') });
    }
  };

  const getChangeColor = (change: string | undefined) => {
    if (!change) return '';
    return parseFloat(change) >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getChangeIcon = (change: string | undefined) => {
    if (!change) return null;
    return parseFloat(change) >= 0 ? (
      <TrendingUp className="w-4 h-4 text-green-600" />
    ) : (
      <TrendingDown className="w-4 h-4 text-red-600" />
    );
  };

  // Fetch price history when viewCoin changes
  useEffect(() => {
    if (viewCoin) {
      axios.get(`https://api.binance.com/api/v3/klines?symbol=${viewCoin.symbol}&interval=1d&limit=30`)
        .then(res => {
          setPriceHistory(res.data.map((d: any) => ({
            date: new Date(d[0]).toLocaleDateString(),
            close: parseFloat(d[4])
          })));
        })
        .catch(() => setPriceHistory([]));
    }
  }, [viewCoin]);

  // Fetch detailed info when viewCoin changes
  useEffect(() => {
    if (viewCoin) {
      setDetailLoading(true);
      cryptoAPI.getCryptoDetail(viewCoin.symbol)
        .then(res => setCoinDetail(res.data))
        .catch(() => setCoinDetail(null))
        .finally(() => setDetailLoading(false));
    } else {
      setCoinDetail(null);
    }
  }, [viewCoin]);

  // Helper to get coin logo from CoinGecko
  const getCoinLogoUrl = (coinDetail: any) => {
    if (coinDetail && coinDetail.image) {
      return coinDetail.image;
    }
    return '/crypto-logos/generic.png';
  };

  const getCryptoWatchlistLength = () => cryptos.length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('Crypto Watchlist')}</CardTitle>
          <CardDescription>{t('Track your favorite cryptocurrencies and get detailed information')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-7xl mx-auto rounded-2xl border mt-1">
      <CardHeader className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {t('Crypto Watchlist')} ({getCryptoWatchlistLength()} {t('coins')})
            </CardTitle>
            <CardDescription>
              {t('Real-time coin prices and performance')}
            </CardDescription>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('Add Coin')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Add Coin Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-96">
              <CardHeader>
                <CardTitle>{t('Add Coin to Watchlist')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Search by Symbol or Coin Name')}</label>
                    <Input
                      placeholder={t('Type symbol or coin name...')}
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setSelectedCoin(null);
                      }}
                      autoFocus
                    />
                    {searching && <div className="text-xs text-muted-foreground mt-1">{t('Searching...')}</div>}
                    {searchResults.length > 0 && (
                      <div className="border rounded mt-2 max-h-48 overflow-y-auto bg-background z-10">
                        {searchResults.map((result, idx) => (
                          <div
                            key={result.symbol + idx}
                            className="px-3 py-2 hover:bg-muted cursor-pointer flex items-center justify-between"
                            onClick={() => {
                              setSelectedCoin(result);
                              setNewSymbol(result.symbol);
                              setNewCoinName(result.baseAsset);
                              setSearchQuery(result.symbol + ' - ' + result.baseAsset);
                              setSearchResults([]);
                            }}
                          >
                            <span>
                              <span className="font-mono font-semibold">{result.symbol}</span> - {result.baseAsset}
                            </span>
                            {trendingCoins.includes(result.symbol) && (
                              <span className="ml-2 text-orange-500 flex items-center gap-1 text-xs">
                                <Flame className="w-3 h-3" /> {t('Trending')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button onClick={handleAddCrypto} className="flex-1" disabled={adding || !selectedCoin}>
                    {adding ? t('Adding...') : t('Add Coin')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAdd(false)} className="flex-1" disabled={adding}>
                    {t('Cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Symbol')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('Coin Name')}</TableHead>
                <TableHead>{t('Price')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('Change')}</TableHead>
                <TableHead>{t('Change %')}</TableHead>
                <TableHead>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cryptos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t('No coins in your watchlist yet.')}
                  </TableCell>
                </TableRow>
              ) : (
                cryptos.map(coin => (
                  <TableRow key={coin.symbol}>
                    <TableCell>{coin.symbol}</TableCell>
                    <TableCell className="hidden sm:table-cell">{coin.coin_name || '-'}</TableCell>
                    <TableCell>{coin.lastPrice ? `$${parseFloat(coin.lastPrice).toLocaleString()}` : '-'}</TableCell>
                    <TableCell className={"hidden sm:table-cell " + getChangeColor(coin.priceChange)}>
                      <div className="flex items-center gap-1">
                        {getChangeIcon(coin.priceChange)}
                        {coin.priceChange ? `$${parseFloat(coin.priceChange).toFixed(2)}` : '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          "inline-block px-2 py-1 rounded-md text-xs font-semibold " +
                          (parseFloat(coin.priceChangePercent || '0') >= 0
                            ? "bg-black text-white"
                            : "bg-red-500 text-white")
                        }
                      >
                        {coin.priceChangePercent
                          ? `${parseFloat(coin.priceChangePercent).toFixed(2)}%`
                          : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewCoin(coin)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveCrypto(coin.symbol)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {viewCoin && (
        <Dialog open={!!viewCoin} onOpenChange={() => setViewCoin(null)}>
          <DialogContent className="max-w-3xl w-full">
            <DialogHeader>
              <DialogTitle>
                <div className="flex items-center gap-3">
                  {coinDetail && (
                    <img
                      src={getCoinLogoUrl(coinDetail)}
                      alt={viewCoin.symbol}
                      className="w-8 h-8 rounded-full border bg-white object-contain"
                      onError={e => { (e.target as HTMLImageElement).src = '/crypto-logos/generic.png'; }}
                    />
                  )}
                  <span>{viewCoin.symbol} {viewCoin.coin_name && `- ${viewCoin.coin_name}`}</span>
                </div>
              </DialogTitle>
              <DialogDescription>
                <div className="text-2xl font-bold mb-2">{viewCoin.lastPrice ? `$${parseFloat(viewCoin.lastPrice).toLocaleString()}` : '-'}</div>
                <div className="mb-4 text-sm text-muted-foreground">Detailed information and analysis for the selected coin.</div>
                {detailLoading ? (
                  <div className="py-8 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                ) : coinDetail ? (
                  <>
                    {coinDetail.description && (
                      <div className="mb-4">
                        <div className="font-semibold mb-1">Introduction</div>
                        <div className="text-sm text-muted-foreground" style={{ maxHeight: 120, overflowY: 'auto' }}>{coinDetail.description}</div>
                      </div>
                    )}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-2">
                      <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                      </TabsList>
                      <TabsContent value="overview">
                        <div className="mb-4">
                          <div className="font-semibold mb-2">Key Metrics</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="text-xs text-muted-foreground">Current Price</div>
                              <div className="font-mono">{coinDetail.lastPrice ? `$${parseFloat(coinDetail.lastPrice).toLocaleString()}` : '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Market Cap</div>
                              <div className="font-mono">{coinDetail.market_cap ? `$${parseFloat(coinDetail.market_cap).toLocaleString()}` : '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Change</div>
                              <div className="font-mono">{coinDetail.priceChange ? `$${parseFloat(coinDetail.priceChange).toFixed(2)}` : '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Change %</div>
                              <div className="font-mono">{coinDetail.priceChangePercent ? `${parseFloat(coinDetail.priceChangePercent).toFixed(2)}%` : '-'}</div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold mb-2">Price Trend (1 Month)</div>
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={priceHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="date" minTickGap={8} />
                              <YAxis domain={['auto', 'auto']} tickFormatter={v => `$${v}`}/>
                              <Tooltip formatter={v => `$${v}`}/>
                              <Line type="monotone" dataKey="close" stroke="#3b82f6" dot={false} strokeWidth={2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </>
                ) : (
                  <div className="text-red-500">Failed to load coin details.</div>
                )}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}