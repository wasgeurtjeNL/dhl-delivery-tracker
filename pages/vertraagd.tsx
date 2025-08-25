import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';

interface TrackingStep {
  id: string;
  title: string;
  status: 'completed' | 'current' | 'pending';
  day: number;
}

interface FeedbackMessage {
  id: number;
  name: string;
  message: string;
  timestamp: Date;
  hearts: number;
}

export default function VertraagdePage() {
  const [animatedStats, setAnimatedStats] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [simulationDay, setSimulationDay] = useState(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [calculatorDays, setCalculatorDays] = useState(3);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [showPersonalMessage, setShowPersonalMessage] = useState(false);
  const [hearts, setHearts] = useState(0);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [feedbackMessages, setFeedbackMessages] = useState<FeedbackMessage[]>([
    { id: 1, name: "Sandra", message: "Eindelijk een bedrijf dat écht naar klanten luistert! 💕", timestamp: new Date(), hearts: 23 },
    { id: 2, name: "Mark", message: "Jullie nieuwe systeem is fantastisch, voel me echt gewaardeerd!", timestamp: new Date(), hearts: 18 },
    { id: 3, name: "Linda", message: "Dít is hoe klantenservice hoort te zijn! 🙌", timestamp: new Date(), hearts: 31 }
  ]);
  const [newFeedback, setNewFeedback] = useState('');
  const [showThankYou, setShowThankYou] = useState(false);
  const [customerJourneyStep, setCustomerJourneyStep] = useState(0);
  const [showImpactStats, setShowImpactStats] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [floatingHearts, setFloatingHearts] = useState<Array<{id: number, x: number, y: number}>>([]);
  
  const confettiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedStats(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Mouse tracking for interactive elements
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Customer Journey Animation
  useEffect(() => {
    const journeyInterval = setInterval(() => {
      setCustomerJourneyStep((prev) => (prev + 1) % customerJourneySteps.length);
    }, 3000);
    return () => clearInterval(journeyInterval);
  }, []);

  const [trackingSteps, setTrackingSteps] = useState<TrackingStep[]>([
    { id: '1', title: 'Bestelling geplaatst', status: 'completed', day: 1 },
    { id: '2', title: 'In behandeling', status: 'completed', day: 1 },
    { id: '3', title: 'Verzonden', status: 'completed', day: 2 },
    { id: '4', title: 'In transit', status: 'current', day: 3 },
    { id: '5', title: 'Bezorgd', status: 'pending', day: 4 },
  ]);

  const compensationTiers = [
    {
      days: "3+ dagen",
      title: "Eerste compensatie",
      compensation: "20 punten",
      icon: "⭐",
      description: "Automatisch toegekend aan je account",
      color: "border-wasgeurtje-gold bg-wasgeurtje-gold/10",
      pointsValue: "€2,00 waardebon",
      loyalMessage: "Voor onze trouwe klanten zoals jij!"
    },
    {
      days: "4+ dagen", 
      title: "Verhoogde compensatie",
      compensation: "40 punten",
      icon: "✨",
      description: "Extra punten voor het ongemak",
      color: "border-wasgeurtje-gold bg-wasgeurtje-gold/20",
      pointsValue: "€4,00 waardebon",
      loyalMessage: "Omdat jullie feedback zo waardevol is!"
    },
    {
      days: "5+ dagen",
      title: "Gratis product",
      compensation: "Fles naar keuze",
      icon: "🎁",
      description: "Kies je favoriete wasgeurtje gratis",
      color: "border-wasgeurtje-gold bg-wasgeurtje-gold/30",
      pointsValue: "Ter waarde van €12,95",
      loyalMessage: "Speciaal voor onze meest loyale klanten!"
    },
    {
      days: "7+ dagen",
      title: "Volledige compensatie",
      compensation: "Fles + nieuwe bestelling",
      icon: "🏆",
      description: "Gratis fles én je gehele bestelling opnieuw",
      color: "border-wasgeurtje-gold bg-wasgeurtje-gold/40",
      pointsValue: "Volledige vergoeding",
      loyalMessage: "Jullie vertrouwen is ons alles waard!"
    }
  ];

  const testimonials = [
    {
      name: "Sandra K.",
      text: "Vroeger moest ik altijd bellen als mijn bestelling vertraagd was. Nu krijg ik automatisch compensatie! Voelt alsof jullie echt om mij geven.",
      rating: 5,
      delay: "4 dagen",
      loyaltyYears: 3,
      emotion: "💕"
    },
    {
      name: "Mark V.",
      text: "Eerste keer dat een bedrijf mij beloont voor hun vertraging. Dit is waarom ik al 5 jaar klant ben en blijf!",
      rating: 5,
      delay: "6 dagen",
      loyaltyYears: 5,
      emotion: "🙌"
    },
    {
      name: "Linda M.",
      text: "Jullie luisteren echt naar feedback! Van briefpost naar dit systeem - wat een transformatie. Trots om jullie klant te zijn.",
      rating: 5,
      delay: "3 dagen", 
      loyaltyYears: 2,
      emotion: "✨"
    },
    {
      name: "Robert D.",
      text: "Dit is precies wat ik vroeger voorstelde! Zo fijn dat jullie onze ideeën serieus nemen en implementeren.",
      rating: 5,
      delay: "5 dagen",
      loyaltyYears: 4,
      emotion: "🎉"
    }
  ];

  const customerJourneySteps = [
    {
      icon: "😔",
      title: "Het probleem",
      description: "Klanten frustreerd door briefpost zonder tracking",
      feedback: "Waar is mijn bestelling?!"
    },
    {
      icon: "💡", 
      title: "Jullie stem",
      description: "Loyale klanten delen hun frustraties en ideeën",
      feedback: "Kunnen jullie niet Track & Trace gebruiken?"
    },
    {
      icon: "👂",
      title: "Wij luisteren",
      description: "Feedback wordt serieus genomen door ons team",
      feedback: "Jullie input is goud waard!"
    },
    {
      icon: "🔧",
      title: "Wij bouwen",
      description: "Nieuwe systemen ontwikkeld op basis van jullie wensen",
      feedback: "Samen maken we het beter!"
    },
    {
      icon: "🎉",
      title: "Jullie beloning",
      description: "Automatische compensatie - jullie droomscenario!",
      feedback: "Dit is wat jullie verdienen!"
    }
  ];

  const impactStats = [
    { number: "2,847", label: "Tevreden klanten", icon: "😊" },
    { number: "94%", label: "Minder klachten", icon: "📉" },
    { number: "€12,450", label: "Uitbetaalde compensatie", icon: "💰" },
    { number: "100%", label: "Automatisch verwerkt", icon: "⚡" }
  ];

  const startSimulation = () => {
    setIsSimulating(true);
    setSimulationDay(1);
    setShowCelebration(false);
    
    setTrackingSteps([
      { id: '1', title: 'Bestelling geplaatst', status: 'completed', day: 1 },
      { id: '2', title: 'In behandeling', status: 'current', day: 1 },
      { id: '3', title: 'Verzonden', status: 'pending', day: 2 },
      { id: '4', title: 'In transit', status: 'pending', day: 3 },
      { id: '5', title: 'Bezorgd', status: 'pending', day: 4 },
    ]);

    const interval = setInterval(() => {
      setSimulationDay(prev => {
        if (prev >= 8) {
          clearInterval(interval);
          setIsSimulating(false);
          setShowCelebration(true);
          triggerConfetti();
          return prev;
        }
        
        setTrackingSteps(current => current.map(step => {
          if (prev >= step.day && step.status !== 'completed') {
            return { ...step, status: 'completed' };
          } else if (prev === step.day - 1) {
            return { ...step, status: 'current' };
          }
          return step;
        }));
        
        return prev + 1;
      });
    }, 1000);
  };

  const triggerConfetti = () => {
    // Create confetti effect
    const colors = ['#d7aa43', '#ffffff', '#000000'];
    const confettiElements = Array.from({ length: 50 }, (_, i) => {
      const element = document.createElement('div');
      element.style.position = 'fixed';
      element.style.left = Math.random() * 100 + 'vw';
      element.style.animationDuration = Math.random() * 3 + 2 + 's';
      element.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      element.style.width = '10px';
      element.style.height = '10px';
      element.style.zIndex = '9999';
      element.style.animation = `confetti-fall ${element.style.animationDuration} linear infinite`;
      
      document.body.appendChild(element);
      
      setTimeout(() => {
        element.remove();
      }, 5000);
    });
  };

  const addHeart = () => {
    setHearts(prev => prev + 1);
    setShowHeartAnimation(true);
    
    // Add floating heart
    const newHeart = {
      id: Date.now(),
      x: mousePosition.x,
      y: mousePosition.y
    };
    
    setFloatingHearts(prev => [...prev, newHeart]);
    
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(heart => heart.id !== newHeart.id));
    }, 2000);
    
    setTimeout(() => setShowHeartAnimation(false), 1000);
  };

  const submitFeedback = () => {
    if (newFeedback.trim() && customerName.trim()) {
      const feedback: FeedbackMessage = {
        id: Date.now(),
        name: customerName,
        message: newFeedback,
        timestamp: new Date(),
        hearts: 0
      };
      
      setFeedbackMessages(prev => [feedback, ...prev.slice(0, 4)]);
      setNewFeedback('');
      setShowThankYou(true);
      triggerConfetti();
      
      setTimeout(() => setShowThankYou(false), 3000);
    }
  };

  const getCompensationForDays = (days: number) => {
    if (days >= 7) return compensationTiers[3];
    if (days >= 5) return compensationTiers[2];
    if (days >= 4) return compensationTiers[1];
    if (days >= 3) return compensationTiers[0];
    return null;
  };

  const currentCompensation = getCompensationForDays(calculatorDays);

  return (
    <>
      <Head>
        <title>Voor Onze Loyale Klanten - Wasgeurtje.nl</title>
        <meta name="description" content="Speciaal voor onze trouwe klanten: ontdek hoe jullie feedback onze nieuwe verzendstrategie vormde" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-wasgeurtje-gold/5 relative overflow-hidden">
        {/* Floating Hearts */}
        {floatingHearts.map(heart => (
          <div
            key={heart.id}
            className="fixed pointer-events-none z-50 text-red-500 text-2xl animate-bounce"
            style={{
              left: heart.x - 10,
              top: heart.y - 10,
              animation: 'float-up 2s ease-out forwards'
            }}
          >
            ❤️
          </div>
        ))}

        {/* Header with Personal Touch */}
        <header className="bg-wasgeurtje-black shadow-lg sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="text-wasgeurtje-white text-2xl font-bold">
                  Wasgeurtje.nl
                </div>
                <div className="hidden md:block text-wasgeurtje-gold text-sm">
                  💕 Voor onze loyale klanten
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={addHeart}
                  className="bg-wasgeurtje-gold/20 hover:bg-wasgeurtje-gold/30 text-wasgeurtje-gold px-3 py-1 rounded-full text-sm transition-all duration-300 flex items-center space-x-1"
                >
                  <span>❤️</span>
                  <span>{hearts}</span>
                </button>
                <div className="text-wasgeurtje-gold text-sm font-medium animate-pulse">
                  ✨ Jullie stem telt!
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Personal Greeting Section */}
        <section className="py-8 bg-gradient-to-r from-wasgeurtje-gold/20 to-wasgeurtje-gold/10">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <h2 className="text-2xl font-bold text-wasgeurtje-black mb-4">
                🙏 Dankjewel voor je loyaliteit!
              </h2>
              <p className="text-gray-700 mb-4">
                Deze pagina bestaat omdat <strong>jullie</strong> ons vertelden wat beter kon. 
                Jullie feedback heeft dit systeem mogelijk gemaakt.
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                <span className="bg-wasgeurtje-gold/20 px-3 py-1 rounded-full">👂 We luisteren</span>
                <span className="bg-wasgeurtje-gold/20 px-3 py-1 rounded-full">🔧 We bouwen</span>
                <span className="bg-wasgeurtje-gold/20 px-3 py-1 rounded-full">🎁 We belonen</span>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Customer Journey */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-wasgeurtje-black mb-4">
                📖 Jullie Verhaal, Onze Missie
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Van klacht naar compliment - hoe jullie feedback deze transformatie mogelijk maakte
              </p>
            </div>

            <div className="relative">
              <div className="flex justify-center mb-8">
                <div className="flex space-x-4 overflow-x-auto pb-4">
                  {customerJourneySteps.map((step, index) => (
                    <div
                      key={index}
                      className={`flex-shrink-0 text-center p-6 rounded-xl transition-all duration-500 ${
                        customerJourneyStep === index 
                          ? 'bg-wasgeurtje-gold/20 scale-110 shadow-xl' 
                          : 'bg-white/50 scale-95'
                      }`}
                      style={{ minWidth: '200px' }}
                    >
                      <div className="text-4xl mb-3">{step.icon}</div>
                      <h3 className="font-bold text-wasgeurtje-black mb-2">{step.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">{step.description}</p>
                      <div className="bg-wasgeurtje-gold/10 rounded-lg p-2">
                        <p className="text-xs italic text-wasgeurtje-black">"{step.feedback}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Hero Section with Enhanced Demo */}
        <section className="relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-6xl font-bold text-wasgeurtje-black mb-6">
                Jullie Wens is{' '}
                <span className="text-wasgeurtje-gold animate-pulse">Werkelijkheid</span>
              </h1>
              
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
                <strong>"Kunnen jullie geen Track & Trace gebruiken?"</strong> - vroegen jullie.
                <br />
                <strong>"Waarom geen automatische compensatie?"</strong> - stelden jullie voor.
                <br />
                💡 <em>En wij luisterden...</em>
              </p>

              <div className="mb-12">
                <button
                  onClick={startSimulation}
                  disabled={isSimulating}
                  className={`bg-wasgeurtje-gold text-wasgeurtje-black px-8 py-4 rounded-full font-bold text-lg shadow-lg hover:shadow-xl transform transition-all duration-300 ${
                    isSimulating ? 'animate-pulse cursor-not-allowed' : 'hover:scale-105'
                  }`}
                >
                  {isSimulating ? '🚀 Jullie idee wordt realiteit...' : '🎮 Zie Jullie Idee in Actie!'}
                </button>
              </div>

              <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto border border-wasgeurtje-gold/20">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-wasgeurtje-black">
                    💝 Jullie Droomsysteem Live
                  </h3>
                  <div className="bg-wasgeurtje-gold/20 px-4 py-2 rounded-full">
                    <span className="font-bold text-wasgeurtje-black">Dag {simulationDay}</span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  {trackingSteps.map((step, index) => (
                    <div key={step.id} className="flex items-center space-x-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step.status === 'completed' ? 'bg-green-500 text-white' :
                        step.status === 'current' ? 'bg-wasgeurtje-gold text-black animate-pulse' :
                        'bg-gray-300 text-gray-500'
                      }`}>
                        {step.status === 'completed' ? '✓' : index + 1}
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${
                          step.status === 'completed' ? 'text-green-600' :
                          step.status === 'current' ? 'text-wasgeurtje-gold' :
                          'text-gray-400'
                        }`}>
                          {step.title}
                        </div>
                        <div className="text-sm text-gray-500">Dag {step.day}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {simulationDay >= 3 && (
                  <div className="bg-gradient-to-r from-wasgeurtje-gold/20 to-wasgeurtje-gold/10 border border-wasgeurtje-gold rounded-xl p-6 animate-bounce">
                    <div className="flex items-center space-x-4">
                      <div className="text-3xl">🎊</div>
                      <div>
                        <h4 className="font-bold text-wasgeurtje-black text-lg">
                          🙌 Jullie Idee Werkt Perfect!
                        </h4>
                        <p className="text-gray-700">
                          {getCompensationForDays(simulationDay)?.compensation} automatisch toegekend - 
                          precies zoals jullie wilden!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {showCelebration && (
                  <div className="mt-6 bg-green-100 border border-green-300 rounded-xl p-6 animate-pulse">
                    <div className="text-center">
                      <div className="text-4xl mb-2">🎉</div>
                      <h4 className="font-bold text-green-800 text-xl mb-2">
                        Dankjewel voor je idee!
                      </h4>
                      <p className="text-green-700">
                        Dit systeem bestaat omdat loyale klanten zoals jij hun stem lieten horen.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Waspunten System Explainer */}
        <section className="py-16 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-wasgeurtje-black mb-4">
                🎯 Hoe werken onze Waspunten?
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Ontdek hoe waardevol je compensatiepunten eigenlijk zijn!
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Interactive Points Calculator */}
              <div className="bg-white rounded-2xl shadow-xl p-8 border border-wasgeurtje-gold/20">
                <h3 className="text-2xl font-bold text-wasgeurtje-black mb-6 text-center">
                  💰 Punten Calculator
                </h3>
                
                <div className="space-y-6">
                  {/* Earning Points */}
                  <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                    <h4 className="font-bold text-green-800 mb-4 flex items-center">
                      <span className="mr-2">💸</span> Punten Verdienen
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">€1 uitgeven</span>
                        <span className="font-bold text-green-600">= 1 punt</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Product review</span>
                        <span className="font-bold text-green-600">= 20 punten</span>
                      </div>
                      <div className="flex justify-between items-center bg-wasgeurtje-gold/20 rounded p-2">
                        <span className="text-gray-700 font-semibold">3+ dagen vertraging</span>
                        <span className="font-bold text-wasgeurtje-gold">= 20 punten GRATIS!</span>
                      </div>
                      <div className="flex justify-between items-center bg-wasgeurtje-gold/30 rounded p-2">
                        <span className="text-gray-700 font-semibold">4+ dagen vertraging</span>
                        <span className="font-bold text-wasgeurtje-gold">= 40 punten GRATIS!</span>
                      </div>
                    </div>
                  </div>

                  {/* Spending Points */}
                  <div className="bg-wasgeurtje-gold/10 rounded-xl p-6 border border-wasgeurtje-gold/30">
                    <h4 className="font-bold text-wasgeurtje-black mb-4 flex items-center">
                      <span className="mr-2">🎁</span> Punten Inwisselen
                    </h4>
                    <div className="text-center">
                      <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                        <div className="text-3xl font-bold text-wasgeurtje-gold mb-2">60 punten</div>
                        <div className="text-lg text-gray-700 mb-2">€14,95 korting</div>
                        <div className="text-sm text-gray-500">Bij minimaal €29,90 bestelling</div>
                      </div>
                      <div className="text-sm text-gray-600">
                        ⏰ Punten blijven 1 jaar geldig
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Points Journey */}
              <div className="bg-white rounded-2xl shadow-xl p-8 border border-wasgeurtje-gold/20">
                <h3 className="text-2xl font-bold text-wasgeurtje-black mb-6 text-center">
                  🗺️ Jouw Punten Reis
                </h3>
                
                <div className="space-y-6">
                  {/* Step 1: Earn */}
                  <div className="flex items-center space-x-4 p-4 bg-green-50 rounded-xl">
                    <div className="bg-green-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold">1</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-green-800">Verzamel Punten</h4>
                      <p className="text-sm text-green-700">Door aankopen, reviews, of... vertraging compensatie! 😉</p>
                    </div>
                    <div className="text-2xl">💎</div>
                  </div>

                  {/* Step 2: Accumulate */}
                  <div className="flex items-center space-x-4 p-4 bg-yellow-50 rounded-xl">
                    <div className="bg-yellow-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold">2</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-yellow-800">Spaar naar 60</h4>
                      <p className="text-sm text-yellow-700">Bijvoorbeeld: €40 bestelling + review = 60 punten!</p>
                    </div>
                    <div className="text-2xl">🎯</div>
                  </div>

                  {/* Step 3: Redeem */}
                  <div className="flex items-center space-x-4 p-4 bg-wasgeurtje-gold/20 rounded-xl">
                    <div className="bg-wasgeurtje-gold text-wasgeurtje-black rounded-full w-10 h-10 flex items-center justify-center font-bold">3</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-wasgeurtje-black">Wissel In!</h4>
                      <p className="text-sm text-gray-700">€14,95 korting op je volgende bestelling van €29,90+</p>
                    </div>
                    <div className="text-2xl">🎉</div>
                  </div>
                </div>

                {/* Quick Examples */}
                <div className="mt-8 bg-gray-50 rounded-xl p-6">
                  <h4 className="font-bold text-gray-800 mb-4 text-center">💡 Snelle Voorbeelden</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center p-2 bg-white rounded">
                      <span>Bestelling €20 + review</span>
                      <span className="font-bold text-green-600">40 punten</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-wasgeurtje-gold/20 rounded">
                      <span>Vertraging 3 dagen 😔</span>
                      <span className="font-bold text-wasgeurtje-gold">+20 punten = 60 totaal! 🎉</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-green-100 rounded">
                      <span>60 punten inwisselen</span>
                      <span className="font-bold text-green-700">€14,95 korting! 💰</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Important Rules in Fun Format */}
            <div className="mt-12 bg-white rounded-2xl shadow-xl p-8 border border-wasgeurtje-gold/20">
              <h3 className="text-2xl font-bold text-wasgeurtje-black mb-6 text-center">
                📋 Belangrijke Spelregels
              </h3>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <div className="text-3xl mb-2">🔐</div>
                  <h4 className="font-bold text-blue-800 mb-2">Inloggen Verplicht</h4>
                  <p className="text-sm text-blue-700">Alleen ingelogde aankopen leveren punten op</p>
                </div>
                
                <div className="text-center p-4 bg-orange-50 rounded-xl">
                  <div className="text-3xl mb-2">⏰</div>
                  <h4 className="font-bold text-orange-800 mb-2">1 Jaar Geldig</h4>
                  <p className="text-sm text-orange-700">Herinnering 1 maand voor vervaldatum</p>
                </div>
                
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <div className="text-3xl mb-2">🎁</div>
                  <h4 className="font-bold text-purple-800 mb-2">Overdraagbaar</h4>
                  <p className="text-sm text-purple-700">Deel punten met familie of vrienden</p>
                </div>
                
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <div className="text-3xl mb-2">↩️</div>
                  <h4 className="font-bold text-red-800 mb-2">Retour Regels</h4>
                  <p className="text-sm text-red-700">Punten aangepast, behalve bij onze fout</p>
                </div>
              </div>
            </div>

            {/* Call to Action */}
            <div className="mt-8 text-center">
              <div className="bg-wasgeurtje-gold/20 rounded-2xl p-6 inline-block">
                <h4 className="font-bold text-wasgeurtje-black mb-2">
                  💡 Pro Tip voor Onze Loyale Klanten
                </h4>
                <p className="text-gray-700">
                  Met ons nieuwe compensatiesysteem krijg je nu automatisch punten bij vertraging - 
                  zelfs als er niks mis gaat met je bestelling! 🎉
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Enhanced Compensation Calculator */}
        <section className="py-16 bg-gradient-to-r from-wasgeurtje-gold/10 to-wasgeurtje-gold/5">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                          <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-wasgeurtje-black mb-4">
                💰 Jouw Persoonlijke Compensatie
              </h2>
              <p className="text-xl text-gray-600">
                Ontworpen door <strong>jullie feedback</strong> - beloond naar <strong>jullie wensen</strong>
              </p>
              <div className="mt-4 inline-block bg-blue-100 rounded-full px-4 py-2">
                <span className="text-sm text-blue-800 font-semibold">
                  💡 Tip: Scroll omhoog om te leren hoe je punten kunt gebruiken!
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-wasgeurtje-gold/20">
              <div className="text-center mb-8">
                <label className="block text-lg font-semibold text-wasgeurtje-black mb-4">
                  Aantal dagen vertraging: <span className="text-wasgeurtje-gold text-3xl">{calculatorDays}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={calculatorDays}
                  onChange={(e) => setCalculatorDays(parseInt(e.target.value))}
                  className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #d7aa43 0%, #d7aa43 ${(calculatorDays - 1) * 10}%, #e5e5e5 ${(calculatorDays - 1) * 10}%, #e5e5e5 100%)`
                  }}
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>1 dag</span>
                  <span>10+ dagen</span>
                </div>
              </div>

              <div className="text-center">
                {currentCompensation ? (
                  <div className={`${currentCompensation.color} rounded-xl p-8 transform transition-all duration-500 scale-105`}>
                    <div className="text-4xl mb-4">{currentCompensation.icon}</div>
                    <h3 className="text-2xl font-bold text-wasgeurtje-black mb-2">
                      {currentCompensation.title}
                    </h3>
                    <div className="text-3xl font-bold text-wasgeurtje-gold mb-2">
                      {currentCompensation.compensation}
                    </div>
                    <div className="text-lg text-gray-700 mb-4">
                      {currentCompensation.pointsValue}
                    </div>
                    <div className="bg-wasgeurtje-gold/20 rounded-lg p-3 mb-3">
                      <p className="text-sm font-semibold text-wasgeurtje-black">
                        💕 {currentCompensation.loyalMessage}
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-200">
                      <p className="text-sm text-blue-800">
                        <strong>💰 Echte waarde:</strong> {currentCompensation.pointsValue}
                      </p>
                      {currentCompensation.compensation.includes('punten') && (
                        <p className="text-xs text-blue-600 mt-1">
                          ⚡ Combineer met andere punten voor €14,95 korting bij 60 punten!
                        </p>
                      )}
                    </div>
                    <p className="text-gray-600">
                      {currentCompensation.description}
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-xl p-8">
                    <div className="text-4xl mb-4">⏰</div>
                    <h3 className="text-xl font-bold text-gray-600 mb-2">
                      Nog geen compensatie
                    </h3>
                    <p className="text-gray-500">
                      Compensatie start vanaf 3 dagen vertraging
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Enhanced Interactive Testimonials */}
        <section className="py-16 bg-gradient-to-r from-wasgeurtje-black to-gray-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                💬 Stemmen van Onze Familie
              </h2>
              <p className="text-xl text-gray-300">
                Echte verhalen van loyale klanten die mee hebben gevormd aan deze verandering
              </p>
            </div>

            <div className="relative">
              <div className="bg-white rounded-2xl p-8 shadow-xl transform transition-all duration-500">
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    {[...Array(testimonials[currentTestimonial].rating)].map((_, i) => (
                      <span key={i} className="text-wasgeurtje-gold text-2xl">⭐</span>
                    ))}
                  </div>
                  <div className="text-4xl mb-4">{testimonials[currentTestimonial].emotion}</div>
                  <blockquote className="text-xl text-gray-700 mb-6 italic">
                    "{testimonials[currentTestimonial].text}"
                  </blockquote>
                  <div className="flex items-center justify-center space-x-6">
                    <div>
                      <div className="font-bold text-wasgeurtje-black text-lg">
                        {testimonials[currentTestimonial].name}
                      </div>
                      <div className="text-sm text-wasgeurtje-gold">
                        💕 {testimonials[currentTestimonial].loyaltyYears} jaar loyale klant
                      </div>
                      <div className="text-sm text-gray-600">
                        Vertraging: {testimonials[currentTestimonial].delay}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-6 space-x-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentTestimonial(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      currentTestimonial === index ? 'bg-wasgeurtje-gold scale-125' : 'bg-gray-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Live Community Feedback */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-wasgeurtje-black mb-4">
                🗣️ Jouw Stem Telt
              </h2>
              <p className="text-xl text-gray-600">
                Deel je gedachten - elke reactie helpt ons beter te worden
              </p>
            </div>

            {/* Live Feedback Stream */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-wasgeurtje-black mb-4 text-center">
                💕 Live Reacties van Klanten
              </h3>
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {feedbackMessages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`bg-wasgeurtje-gold/10 rounded-lg p-4 border-l-4 border-wasgeurtje-gold transform transition-all duration-500 ${
                      index === 0 ? 'animate-pulse' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-wasgeurtje-black">{message.name}</div>
                        <div className="text-gray-700">{message.message}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setFeedbackMessages(prev => 
                              prev.map(m => m.id === message.id ? {...m, hearts: m.hearts + 1} : m)
                            );
                            addHeart();
                          }}
                          className="text-red-500 hover:scale-125 transition-transform"
                        >
                          ❤️
                        </button>
                        <span className="text-sm text-gray-600">{message.hearts}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Feedback Input */}
            <div className="bg-wasgeurtje-gold/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-wasgeurtje-black mb-4 text-center">
                ✨ Deel je ervaring
              </h3>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Je naam..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-2 border border-wasgeurtje-gold/30 rounded-lg focus:outline-none focus:border-wasgeurtje-gold"
                />
                <textarea
                  placeholder="Wat vind je van onze nieuwe aanpak? Deel je gedachten..."
                  value={newFeedback}
                  onChange={(e) => setNewFeedback(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-wasgeurtje-gold/30 rounded-lg focus:outline-none focus:border-wasgeurtje-gold resize-none"
                />
                <button
                  onClick={submitFeedback}
                  disabled={!newFeedback.trim() || !customerName.trim()}
                  className={`w-full py-3 rounded-lg font-semibold transition-all duration-300 ${
                    newFeedback.trim() && customerName.trim()
                      ? 'bg-wasgeurtje-gold text-wasgeurtje-black hover:bg-wasgeurtje-gold/90 transform hover:scale-105'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  💕 Deel je ervaring
                </button>
              </div>
            </div>

            {showThankYou && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-8 max-w-md mx-4 text-center animate-bounce">
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-2xl font-bold text-wasgeurtje-black mb-4">
                    Dankjewel, {customerName}!
                  </h3>
                  <p className="text-gray-700">
                    Jouw feedback is ontzettend waardevol voor ons. 
                    Samen maken we de klantervaring nog beter! 💕
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Impact Statistics */}
        <section className="py-16 bg-gradient-to-r from-wasgeurtje-gold/20 to-wasgeurtje-gold/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-wasgeurtje-black mb-4">
                📊 Jullie Impact in Cijfers
              </h2>
              <p className="text-xl text-gray-600">
                Dit is wat jullie feedback heeft bewerkstelligd
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              {impactStats.map((stat, index) => (
                <div
                  key={index}
                  className={`bg-white rounded-xl p-6 text-center shadow-lg transform transition-all duration-500 hover:scale-105 ${
                    animatedStats ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                  }`}
                  style={{ transitionDelay: `${index * 200}ms` }}
                >
                  <div className="text-4xl mb-3">{stat.icon}</div>
                  <div className="text-3xl font-bold text-wasgeurtje-gold mb-2">
                    {stat.number}
                  </div>
                  <div className="text-gray-600 font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Enhanced CTA */}
        <section className="py-16 bg-wasgeurtje-black">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              🙏 Dankjewel voor je Vertrouwen
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Zonder loyale klanten zoals jullie was deze transformatie nooit mogelijk geweest. 
              Jullie stem heeft dit systeem gevormd.
            </p>
            
            <div className="bg-white/10 rounded-xl p-8 backdrop-blur-sm hover:bg-white/20 transition-all duration-300 mb-8">
              <div className="text-wasgeurtje-gold text-2xl font-bold mb-4">
                💕 Van Hart tot Hart
              </div>
              <div className="text-white text-lg mb-4">
                "Jullie ideeën worden werkelijkheid"
              </div>
              <div className="text-gray-300">
                - Het Wasgeurtje.nl Team
              </div>
            </div>

            <button
              onClick={addHeart}
              className="bg-wasgeurtje-gold text-wasgeurtje-black px-8 py-4 rounded-full font-bold text-lg shadow-lg hover:shadow-xl transform transition-all duration-300 hover:scale-105"
            >
              ❤️ Stuur een hartje terug!
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-900 text-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="text-wasgeurtje-gold font-bold text-lg mb-2">
                Wasgeurtje.nl 💕
              </div>
              <p className="text-gray-400 text-sm">
                Gebouwd door jullie feedback, gedreven door jullie vertrouwen
              </p>
            </div>
          </div>
        </footer>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #d7aa43;
          cursor: pointer;
          box-shadow: 0 0 2px 0 #555;
          transition: background .15s ease-in-out;
        }
        
        .slider::-webkit-slider-thumb:hover {
          background: #c19a3a;
        }
        
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #d7aa43;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 2px 0 #555;
        }
        
        @keyframes float-up {
          0% { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
          100% { 
            opacity: 0; 
            transform: translateY(-100px) scale(1.5); 
          }
        }
        
        @keyframes confetti-fall {
          0% { 
            transform: translateY(-100vh) rotate(0deg); 
            opacity: 1; 
          }
          100% { 
            transform: translateY(100vh) rotate(360deg); 
            opacity: 0; 
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </>
  );
}