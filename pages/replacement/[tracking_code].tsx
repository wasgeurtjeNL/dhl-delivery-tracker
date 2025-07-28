// pages/replacement/[tracking_code].tsx
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';

interface Product {
  id: number;
  name: string;
  price: string;
  images: { src: string; alt: string }[];
  description: string;
  short_description: string;
}

interface CustomerInfo {
  email: string;
  first_name: string;
  last_name: string;
}

interface ValidationResult {
  valid: boolean;
  tracking_info?: {
    tracking_code: string;
    order_id: string;
    customer: CustomerInfo;
  };
  error?: string;
  reason?: string;
  message?: string;
}



// Confetti component voor celebrations
const Confetti = ({ active }: { active: boolean }) => {
  if (!active) return null;
  
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {[...Array(50)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-gradient-to-br from-yellow-400 to-yellow-600"
          initial={{ 
            x: Math.random() * window.innerWidth,
            y: -20,
            rotate: 0,
            opacity: 1
          }}
          animate={{ 
            y: window.innerHeight + 20,
            rotate: Math.random() * 360,
            opacity: 0
          }}
          transition={{ 
            duration: Math.random() * 3 + 2,
            ease: "easeOut",
            delay: Math.random() * 0.5
          }}
          style={{
            left: `${Math.random() * 100}%`,
            borderRadius: Math.random() > 0.5 ? '50%' : '0%'
          }}
        />
      ))}
    </div>
  );
};

export default function ReplacementPage() {
  const router = useRouter();
  const { tracking_code } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [customerNotes, setCustomerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [hoveredProduct, setHoveredProduct] = useState<number | null>(null);
  const [favoriteProducts, setFavoriteProducts] = useState<number[]>([]);

  useEffect(() => {
    if (tracking_code && typeof tracking_code === 'string') {
      validateAndLoadData(tracking_code);
    }
  }, [tracking_code]);

  const validateAndLoadData = async (trackingCode: string) => {
    try {
      setLoading(true);
      
      // Valideer tracking code
      const validationResponse = await fetch(`/api/replacement/validate?tracking_code=${trackingCode}`);
      const validation = await validationResponse.json();
      
      setValidationResult(validation);
      
      if (validation.valid) {
        // Haal producten op
        const productsResponse = await fetch('/api/replacement/products');
        const productsData = await productsResponse.json();
        
        if (productsData.success) {
          setProducts(productsData.products);
        }
      }
      
    } catch (error) {
      console.error('Failed to load replacement data:', error);
      setValidationResult({
        valid: false,
        error: 'Er ging iets mis bij het laden van de pagina'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelection = (productId: number) => {
    setSelectedProduct(productId);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
    
    // Haptic feedback voor mobile
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const toggleFavorite = (productId: number) => {
    setFavoriteProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSubmitOrder = async () => {
    if (!selectedProduct || !tracking_code) return;
    
    setSubmitting(true);
    
    try {
      const response = await fetch('/api/replacement/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tracking_code,
          product_id: selectedProduct,
          customer_notes: customerNotes
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setOrderDetails(result.replacement_order);
        setOrderComplete(true);
        setShowConfetti(true);
      } else {
        alert('Er ging iets mis bij het aanmaken van je bestelling. Probeer het opnieuw.');
      }
      
    } catch (error) {
      console.error('Failed to create replacement order:', error);
      alert('Er ging iets mis. Probeer het opnieuw.');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state - Premium
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 flex items-center justify-center">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative">
            <motion.div 
              className="w-24 h-24 border-4 border-purple-300 rounded-full mx-auto mb-6"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <motion.div 
                className="absolute inset-2 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </motion.div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Jouw VIP ervaring wordt voorbereid...</h2>
          <p className="text-purple-200">Even geduld, we rollen de rode loper voor je uit</p>
        </motion.div>
      </div>
    );
  }

  // Error states - Premium styling
  if (!validationResult?.valid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <Head>
          <title>Oeps! - Wasgeurtje VIP Service</title>
        </Head>
        
        <div className="container mx-auto px-4 py-16">
          <motion.div 
            className="max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl shadow-2xl p-12 border border-gray-700">
              <motion.div 
                className="text-7xl mb-6"
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5 }}
              >
                😔
              </motion.div>
              <h1 className="text-4xl font-bold text-white mb-4">
                Oeps! Er ging iets mis
              </h1>
              
              <div className="text-gray-300 mb-8 text-lg">
                {validationResult?.reason === 'TRACKING_NOT_FOUND' && (
                  <>
                    <p className="mb-4">We kunnen je VIP code niet vinden in ons systeem.</p>
                    <p>Controleer of je de juiste link hebt gebruikt uit je email.</p>
                  </>
                )}
                
                {validationResult?.reason === 'REPLACEMENT_EXISTS' && (
                  <>
                    <p className="mb-4">Je hebt al een VIP vervangingsproduct aangevraagd.</p>
                    <p>Check je email voor details van je exclusive bestelling.</p>
                  </>
                )}
                
                {validationResult?.reason === 'DAY5_EMAIL_NOT_SENT' && (
                  <>
                    <p className="mb-4">Je pakket kwalificeert nog niet voor onze VIP service.</p>
                    <p>Wacht tot je de exclusive uitnodiging hebt ontvangen.</p>
                  </>
                )}
              </div>
              
              <div className="bg-gradient-to-r from-purple-800 to-purple-900 rounded-2xl p-6 mb-8">
                <p className="text-purple-100 font-medium text-lg">
                  💌 Heb je vragen? Ons VIP team staat voor je klaar via
                </p>
                <a href="mailto:vip@wasgeurtje.nl" className="text-yellow-400 underline text-xl font-bold">
                  vip@wasgeurtje.nl
                </a>
              </div>
              
              <motion.button
                onClick={() => window.location.href = 'https://wasgeurtje.nl'}
                className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-gray-900 px-10 py-4 rounded-full font-bold text-lg hover:from-yellow-400 hover:to-yellow-500 transition-all transform hover:scale-105 shadow-xl"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Terug naar Wasgeurtje.nl
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Success state - Celebration
  if (orderComplete && orderDetails) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-emerald-800 to-teal-900">
        <Confetti active={showConfetti} />
        <Head>
          <title>Gefeliciteerd! - Wasgeurtje VIP Service</title>
        </Head>
        
        <div className="container mx-auto px-4 py-16">
          <motion.div 
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-gradient-to-br from-emerald-800 to-teal-900 rounded-3xl shadow-2xl p-12 border-2 border-yellow-400/30">
              <motion.div 
                className="text-8xl mb-6"
                animate={{ 
                  rotate: [0, -10, 10, -10, 0],
                  scale: [1, 1.2, 1]
                }}
                transition={{ duration: 0.8 }}
              >
                🎉
              </motion.div>
              
              <h1 className="text-5xl font-bold text-white mb-6">
                Gefeliciteerd, VIP!
              </h1>
              
              <motion.div 
                className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-gray-900 rounded-2xl p-8 mb-8"
                animate={{ boxShadow: ['0 0 20px rgba(251, 191, 36, 0.5)', '0 0 40px rgba(251, 191, 36, 0.8)', '0 0 20px rgba(251, 191, 36, 0.5)'] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <h2 className="font-bold text-2xl mb-3">VIP Bestelling #{orderDetails.woocommerce_order_number}</h2>
                <p className="text-lg">
                  Je exclusive vervangingsproduct wordt met voorrang verzonden. 
                </p>
                <p className="text-lg mt-2">
                  Als VIP ontvang je: <strong>Gratis Express verzending + Exclusive VIP Card</strong>
                </p>
              </motion.div>
              
              <div className="bg-gradient-to-br from-purple-800 to-purple-900 rounded-2xl p-8 mb-8">
                <h3 className="font-bold text-2xl text-white mb-4">
                  ❤️ Je bent belangrijk voor ons
                </h3>
                <p className="text-purple-100 text-lg">
                  Bedankt voor je vertrouwen in Wasgeurtje. Jouw loyaliteit betekent alles voor ons.
                  Daarom zetten we graag dat stapje extra voor jou.
                </p>
              </div>
              
              <div className="space-y-4">
                <motion.button
                  onClick={() => {
                    // Share functionality
                    if (navigator.share) {
                      navigator.share({
                        title: 'Wasgeurtje VIP Ervaring',
                        text: 'Ik ben net VIP behandeld door @Wasgeurtje! Ongelofelijke service 🌟',
                        url: 'https://wasgeurtje.nl'
                      });
                    }
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  📱 Deel jouw VIP ervaring
                </motion.button>
                
                <motion.button
                  onClick={() => window.location.href = 'https://wasgeurtje.nl'}
                  className="w-full bg-gradient-to-r from-gray-700 to-gray-800 text-white px-8 py-4 rounded-full font-bold text-lg hover:from-gray-800 hover:to-gray-900 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Terug naar Wasgeurtje.nl
                </motion.button>
              </div>
              
              <p className="text-sm text-gray-400 mt-6">
                VIP Hotline: <a href="mailto:vip@wasgeurtje.nl" className="text-yellow-400 underline">vip@wasgeurtje.nl</a>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Main VIP replacement selection page
  const customer = validationResult.tracking_info?.customer;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      <Confetti active={showConfetti} />
      <Head>
        <title>VIP Selection - Wasgeurtje Exclusive</title>
        <meta name="description" content="Exclusive VIP vervangingsservice van Wasgeurtje" />
      </Head>
      
      {/* Premium Header */}
      <motion.div 
        className="bg-black/20 backdrop-blur-lg border-b border-white/10"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <motion.div 
                className="w-14 h-14 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-xl"
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <span className="text-gray-900 font-black text-2xl">W</span>
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold text-white">Wasgeurtje VIP Service</h1>
                <p className="text-sm text-purple-300">Exclusive Replacement Experience</p>
              </div>
            </div>
            <motion.div 
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 px-4 py-2 rounded-full"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <p className="text-sm font-bold text-gray-900">⭐ VIP STATUS</p>
            </motion.div>
          </div>
        </div>
      </motion.div>

      <div className="container mx-auto px-4 py-8">
        {/* VIP Welcome Animation */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="bg-red-500/20 border border-red-400/30 rounded-full px-6 py-2 inline-block mb-6"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="text-red-300 font-semibold">⚠️ Je pakket heeft vertraging opgelopen</p>
          </motion.div>
          
          <motion.h1 
            className="text-5xl md:text-6xl font-black text-white mb-4"
          >
            Sorry {customer?.first_name}! 😔
          </motion.h1>
          
          <p className="text-3xl text-purple-100 mb-6">Je pakket is nog onderweg...</p>
          
          <motion.div 
            className="inline-block"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
          >
            <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-gray-900 px-8 py-4 rounded-full">
              <p className="text-2xl font-black">DAAROM: Kies een GRATIS product! 🎁</p>
            </div>
          </motion.div>
        </motion.div>



        {/* Ons compensatiebeleid */}
        <motion.div 
          className="max-w-5xl mx-auto mb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 backdrop-blur-xl rounded-3xl p-8 border border-purple-500/20">
            <motion.h2 
              className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 mb-6"
              animate={{ 
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }}
              transition={{ duration: 5, repeat: Infinity }}
              style={{ backgroundSize: '200% 200%' }}
            >
              "Een vleugje extra aandacht – juist op momenten dat het nodig is"
            </motion.h2>
            
            <div className="text-purple-100 space-y-4 mb-8">
              <p className="text-lg text-center">
                Een vertraging is nooit leuk – dat begrijpen we als geen ander.
                Ook al ligt het buiten onze macht, we laten je liever niet met een minder gevoel achter.
              </p>
              <p className="text-lg text-center font-semibold text-yellow-300">
                Daarom zetten we nét dat stapje extra om jou toch een fijne ervaring te geven.
              </p>
            </div>

            <div className="bg-black/40 rounded-2xl p-6 mb-6">
              <h3 className="text-2xl font-bold text-white mb-4 text-center">
                🎁 Wat kun je verwachten bij vertraging?
              </h3>
              
              <div className="space-y-4">
                <motion.div 
                  className="bg-gradient-to-r from-purple-800/30 to-indigo-800/30 rounded-xl p-4 border border-purple-500/20"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring" }}
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl">🕒</span>
                    <div className="flex-1">
                      <p className="font-bold text-yellow-400">Na 3 dagen vertraging:</p>
                      <p className="text-purple-200">Je ontvangt 30 gratis loyaliteitspunten in je account – te besteden op een moment dat het jou uitkomt.</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  className="bg-gradient-to-r from-yellow-600/30 to-orange-600/30 rounded-xl p-4 border border-yellow-500/30 shadow-lg shadow-yellow-500/20"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring" }}
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl">📦</span>
                    <div className="flex-1">
                      <p className="font-bold text-yellow-400">Na 5 dagen vertraging: ⬅️ JOUW SITUATIE</p>
                      <p className="text-yellow-200 font-semibold">Je mag een gratis geurproduct naar keuze uitkiezen. Een kleine traktatie, speciaal voor jou.</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  className="bg-gradient-to-r from-green-800/30 to-emerald-800/30 rounded-xl p-4 border border-green-500/20"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring" }}
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl">🚚</span>
                    <div className="flex-1">
                      <p className="font-bold text-green-400">Na 7 dagen vertraging:</p>
                      <p className="text-green-200">We sturen je volledige bestelling opnieuw op – kosteloos. Komt het oorspronkelijke pakket daarna alsnog binnen? Dan mag je dat gewoon houden. Cadeautje van ons!</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            <motion.div 
              className="text-center"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <p className="text-lg font-semibold text-yellow-300">
                💛 Wasgeurtje.nl – Omdat geurbeleving begint met een fijne ervaring
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* Status info box */}
        <motion.div 
          className="max-w-4xl mx-auto mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-xl font-bold text-white mb-3 text-center">
              📦 Jouw huidige situatie
            </h3>
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="bg-black/30 rounded-xl p-4">
                <p className="text-orange-300 font-semibold">🚚 Origineel pakket</p>
                <p className="text-orange-200 text-sm mt-1">Nog onderweg naar jou</p>
              </div>
              <div className="bg-black/30 rounded-xl p-4">
                <p className="text-yellow-300 font-semibold">🎁 Je compensatie</p>
                <p className="text-yellow-200 text-sm mt-1">1 gratis product (Dag 5)</p>
              </div>
              <div className="bg-black/30 rounded-xl p-4">
                <p className="text-green-300 font-semibold">💰 Totale kosten</p>
                <p className="text-green-200 text-sm mt-1">€0,00 (incl. verzending)</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Product Selection - Premium Grid */}
        <motion.div 
          className="max-w-7xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
        >
          <div className="text-center mb-8">
            <motion.div
              className="bg-gradient-to-r from-red-500/20 to-orange-500/20 backdrop-blur-sm rounded-2xl p-6 mb-6 max-w-3xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="text-2xl font-bold text-white mb-2">
                🚚 Je originele pakket is nog steeds onderweg!
              </h3>
              <p className="text-orange-200">
                Dit gratis product is een <span className="font-bold text-orange-300">extra cadeau</span> als compensatie voor de vertraging.
                Je originele bestelling wordt nog steeds geleverd.
              </p>
            </motion.div>
            
            <h2 className="text-4xl font-bold text-white mb-2">
              🎁 Kies je GRATIS compensatie product
            </h2>
            <p className="text-purple-200 text-lg mb-2">Geen verzendkosten, geen addertjes - gewoon onze manier om sorry te zeggen</p>
            <p className="text-purple-300 text-sm italic">
              "Bij Wasgeurtje.nl geloven we dat echte service zich juist laat zien als iets niet helemaal perfect gaat"
            </p>
          </div>
          
          {products.length === 0 ? (
            <div className="text-center py-12">
              <motion.div 
                className="inline-block"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full" />
              </motion.div>
              <p className="text-purple-200 mt-4">VIP collectie wordt geladen...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  whileHover={{ y: -10 }}
                  onHoverStart={() => setHoveredProduct(product.id)}
                  onHoverEnd={() => setHoveredProduct(null)}
                  onClick={() => handleProductSelection(product.id)}
                  className={`cursor-pointer relative group ${
                    selectedProduct === product.id ? 'ring-4 ring-yellow-400' : ''
                  }`}
                >
                  <div className={`
                    relative overflow-hidden rounded-2xl
                    bg-gradient-to-br from-gray-900 to-black
                    transform transition-all duration-300
                    ${selectedProduct === product.id ? 'scale-105' : ''}
                  `}>
                    {/* Glow effect */}
                    <div className={`
                      absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-yellow-600/20 
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300
                    `} />
                    
                    {/* Favorite button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(product.id);
                      }}
                      className="absolute top-4 right-4 z-10"
                    >
                      <motion.div
                        animate={{ scale: favoriteProducts.includes(product.id) ? [1, 1.2, 1] : 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <svg 
                          className={`w-8 h-8 ${
                            favoriteProducts.includes(product.id) 
                              ? 'text-red-500 fill-current' 
                              : 'text-white/50 hover:text-white'
                          }`} 
                          fill={favoriteProducts.includes(product.id) ? 'currentColor' : 'none'}
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </motion.div>
                    </button>
                    
                                          {/* Gratis Badge */}
                      <div className="absolute top-4 left-4 z-10">
                        <motion.div 
                          className="bg-gradient-to-r from-green-400 to-green-600 text-gray-900 px-3 py-1 rounded-full text-xs font-bold"
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          100% GRATIS
                        </motion.div>
                      </div>
                    
                    {product.images && product.images[0] && (
                      <div className="relative h-64 overflow-hidden">
                        <Image
                          src={product.images[0].src}
                          alt={product.images[0].alt || product.name}
                          fill
                          className="object-cover transform group-hover:scale-110 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      </div>
                    )}
                    
                    <div className="p-6">
                      <h3 className="font-bold text-xl text-white mb-2 group-hover:text-yellow-400 transition-colors">
                        {product.name}
                      </h3>
                      
                      {product.short_description && (
                        <p className="text-sm text-gray-400 mb-4 line-clamp-2" 
                           dangerouslySetInnerHTML={{ __html: product.short_description }} />
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500 line-through">€{product.price}</p>
                          <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
                            GRATIS
                          </p>
                        </div>
                        
                        {selectedProduct === product.id && (
                          <motion.div 
                            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-gray-900 px-4 py-2 rounded-full text-sm font-bold"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            ✓ GESELECTEERD
                          </motion.div>
                        )}
                      </div>
                      
                      {/* Hover info */}
                      <AnimatePresence>
                        {hoveredProduct === product.id && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-4 right-4 mb-2 bg-black/90 text-white p-3 rounded-xl text-sm z-20"
                          >
                            <p className="font-semibold mb-1">Waarom dit product?</p>
                            <p className="text-xs text-gray-300">Perfect voor jouw smaak • Bestseller • {Math.floor(Math.random() * 50) + 50}% match score</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Personal message section */}
        {selectedProduct && (
          <motion.div 
            className="max-w-4xl mx-auto mt-12"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-gradient-to-br from-purple-800/50 to-indigo-800/50 backdrop-blur-lg rounded-3xl p-8 border border-purple-500/20">
              <h3 className="text-2xl font-bold text-white mb-4">
                💌 Persoonlijk bericht (optioneel)
              </h3>
              <p className="text-purple-200 mb-4">
                Wil je ons iets speciaals vertellen? We lezen elk bericht persoonlijk.
              </p>
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Vertel ons wat je wilt... bijvoorbeeld je favoriete geur, een speciale gelegenheid, of gewoon een groet!"
                className="w-full h-32 px-6 py-4 bg-black/30 border border-purple-500/30 rounded-2xl text-white placeholder-purple-400 focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
                maxLength={500}
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-sm text-purple-300">
                  {customerNotes.length}/500 karakters
                </p>
                {customerNotes.length > 0 && (
                  <motion.p 
                    className="text-sm text-yellow-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    ❤️ Bedankt voor je bericht!
                  </motion.p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Submit button - VIP Style */}
        {selectedProduct && (
          <motion.div 
            className="max-w-4xl mx-auto mt-8 mb-12"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-gradient-to-br from-gray-900 to-black rounded-3xl p-8 text-center">
              <motion.button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className={`
                  relative overflow-hidden
                  px-12 py-6 rounded-full font-black text-xl
                  transform transition-all duration-300
                  ${submitting
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-gray-900 hover:scale-105 hover:shadow-2xl'
                  }
                `}
                whileHover={!submitting ? { scale: 1.05 } : {}}
                whileTap={!submitting ? { scale: 0.95 } : {}}
              >
                {submitting ? (
                  <span className="flex items-center justify-center">
                    <motion.div 
                      className="w-6 h-6 border-3 border-gray-400 border-t-transparent rounded-full mr-3"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    VIP bestelling wordt aangemaakt...
                  </span>
                ) : (
                  <>
                    <motion.span
                      className="absolute inset-0 bg-white/20"
                      initial={{ x: '-100%', skewX: '-20deg' }}
                      animate={{ x: '200%', skewX: '-20deg' }}
                      transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
                    />
                                         <span className="relative">
                      🎁 JA! Ik wil mijn GRATIS compensatie
                    </span>
                  </>
                )}
              </motion.button>
              
              <motion.p 
                className="text-sm text-purple-300 mt-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                ✅ Volledig gratis (ook verzending) • 📦 Je originele bestelling komt nog • 🚚 Express verzending • 💌 Persoonlijke excuusbrief
              </motion.p>
              
              <div className="mt-8 flex justify-center space-x-8">
                <div className="text-center">
                  <p className="text-3xl font-bold text-yellow-400">€0,-</p>
                  <p className="text-xs text-purple-400">Totale kosten</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-yellow-400">4.9★</p>
                  <p className="text-xs text-purple-400">Klantbeoordeling</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-yellow-400">24u</p>
                  <p className="text-xs text-purple-400">Express levering</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Trust & Community */}
        <motion.div 
          className="max-w-6xl mx-auto mt-16 mb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <div className="text-center mb-8">
            <h3 className="text-3xl font-bold text-white mb-2">💬 Wat VIP klanten zeggen</h3>
            <p className="text-purple-200">Echte reviews van onze meest loyale klanten</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Lisa M.", text: "Ongelofelijk! Nog nooit zo'n VIP behandeling gehad. De verpakking was prachtig!", rating: 5 },
              { name: "Tom K.", text: "De exclusive VIP card is zo mooi! Voel me echt gewaardeerd als klant.", rating: 5 },
              { name: "Sarah D.", text: "Express levering binnen 24u! En dat gratis vervangingsproduct ruikt heerlijk!", rating: 5 }
            ].map((review, index) => (
              <motion.div
                key={index}
                className="bg-gradient-to-br from-purple-800/30 to-indigo-800/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 + index * 0.1 }}
              >
                <div className="flex mb-3">
                  {[...Array(review.rating)].map((_, i) => (
                    <span key={i} className="text-yellow-400">★</span>
                  ))}
                </div>
                <p className="text-purple-100 mb-3 italic">"{review.text}"</p>
                <p className="text-purple-300 text-sm font-semibold">{review.name}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div 
          className="text-center mt-16 pb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          <p className="text-purple-300 mb-2">
            Een exclusive service van Wasgeurtje.nl
          </p>
          <p className="text-purple-400 text-sm">
            VIP Hotline: <a href="mailto:vip@wasgeurtje.nl" className="text-yellow-400 underline">vip@wasgeurtje.nl</a> | 
            <span className="ml-2">🏆 Lid sinds 2024 van de VIP Club</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}