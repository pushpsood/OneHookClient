import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Mail } from 'lucide-react';
import { BrandWordmark } from '../common/BrandWordmark';
import { SiteFooter } from '../common/SiteFooter';

export function Contact() {
  const navigate = useNavigate();
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = React.useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would send to a backend endpoint
    setSubmitted(true);
    setTimeout(() => {
      setFormData({ name: '', email: '', subject: '', message: '' });
      setSubmitted(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] hover:opacity-60 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <BrandWordmark className="text-2xl font-bold tracking-tighter uppercase" />
          <div className="w-20" />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-16 px-6 bg-gradient-to-b from-bg to-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto text-center"
        >
          <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight mb-6">
            Get in Touch
          </h1>
          <p className="text-xl opacity-60 italic">
            Have questions? We'd love to hear from you. Get in touch with our team.
          </p>
        </motion.div>
      </section>

      {/* Contact Methods */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-12 mb-24">
            {[
              {
                icon: Mail,
                title: 'Email',
                value: 'support@onehook.club',
                description: 'For general inquiries',
              },
              {
                icon: Mail,
                title: 'Privacy & Compliance',
                value: 'privacy@onehook.club',
                description: 'Data protection questions',
              },
              {
                icon: Mail,
                title: 'Business',
                value: 'hello@onehook.club',
                description: 'Partnerships & media',
              },
            ].map((method, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="text-center p-8 border border-border rounded-lg hover:shadow-lg transition-shadow"
              >
                <method.icon className="w-8 h-8 text-accent mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">{method.title}</h3>
                <a
                  href={`mailto:${method.value}`}
                  className="text-accent font-mono text-sm hover:opacity-70 transition-opacity block mb-3"
                >
                  {method.value}
                </a>
                <p className="text-sm opacity-60">{method.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Contact Form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onSubmit={handleSubmit}
            className="max-w-2xl mx-auto bg-bg p-12 rounded-lg border border-border"
          >
            <h2 className="text-3xl font-serif italic mb-8">Send us a Message</h2>

            {submitted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-6 p-4 bg-green-50 border border-green-200 rounded text-green-700"
              >
                Thank you for your message! We'll get back to you soon.
              </motion.div>
            )}

            <div className="space-y-6">
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-60"
                >
                  Your Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-60"
                >
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label
                  htmlFor="subject"
                  className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-60"
                >
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="How can we help?"
                />
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-60"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  placeholder="Your message here..."
                />
              </div>

              <button
                type="submit"
                className="w-full px-6 py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity"
              >
                Send Message
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-border text-xs opacity-50 text-center">
              <p>
                We respect your privacy. Your message will only be used to respond to your inquiry.
                See our{' '}
                <button
                  onClick={() => navigate('/privacy')}
                  className="text-accent hover:underline"
                >
                  Privacy Policy
                </button>{' '}
                for details.
              </p>
            </div>
          </motion.form>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
